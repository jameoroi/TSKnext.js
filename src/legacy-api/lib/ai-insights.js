// Written analysis of the analytics report.
//
// Nothing here invents numbers. The model is handed the aggregate the report
// already computed and is asked to explain it; if no provider is configured or
// the call fails, the caller gets an empty list and the dashboard says so
// rather than showing a plausible-looking sentence nobody measured.
//
// Three back ends answer the same prompt and return the same shape, so the
// shop can use whichever it already pays for. n8n is listed last on purpose:
// it is a workflow the merchant owns rather than a model, so what comes back
// depends on what they wired into it, and the parser below is the only thing
// standing between that and the dashboard.

const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 25000;
/** What the dashboard knows how to badge. Anything else is read as the last one. */
const TYPES = new Set(['bestseller', 'warning', 'trend', 'opportunity']);

const env = (name) => String(process.env[name] || '').trim();

/**
 * Every provider takes the prompt and returns raw text, or throws.
 *
 * Order matters: `resolveProviders` keeps every configured one in this order
 * and they are tried in turn until one answers, unless AI_INSIGHT_PROVIDER
 * names one outright — which pins it, because naming a provider is a decision
 * and falling back off a decision would make that setting a suggestion.
 */
/**
 * A provider that refused, as an error carrying its status.
 *
 * Each `complete` used to answer `return null` on any non-OK response, which
 * threw the status away at the only point anybody had it. From there an expired
 * key, a model name the API had stopped serving, and a shop with no key at all
 * were the same empty string — and the shop ran for a day on "AI ใช้ไม่ได้"
 * with no way to tell which.
 *
 * The status is the whole diagnosis and nothing else from the response comes
 * with it: these APIs quote the failing request back in their error bodies, and
 * the failing request carries the key.
 */
function refusedBy(provider, status) {
  const error = new Error(`${provider}_http_${status}`);
  error.status = status;
  error.provider = provider;
  return error;
}

const PROVIDERS = [
  {
    name: 'openai',
    configured: () => !!env('OPENAI_API_KEY'),
    async complete(prompt, signal) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env('OPENAI_API_KEY')}` },
        body: JSON.stringify({
          model: env('AI_INSIGHT_MODEL') || 'gpt-4o-mini',
          max_tokens: 1024,
          temperature: 0.2,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal,
      });
      if (!response.ok) throw refusedBy('openai', response.status);
      const payload = await response.json();
      return String(payload?.choices?.[0]?.message?.content || '');
    },
  },
  {
    name: 'gemini',
    configured: () => !!(env('GEMINI_API_KEY') || env('GOOGLE_AI_API_KEY')),
    // `json` because the two callers want different things out of the same
    // model. The insights prompt asks for a JSON array and `responseMimeType`
    // is what stops the model wrapping it in a sentence; the chat fallback
    // asks for one or two sentences to a customer, and forcing JSON there
    // returns a quoted string that the chat window would show complete with
    // its braces.
    async complete(prompt, signal, tenantId, { json = true } = {}) {
      const key = env('GEMINI_API_KEY') || env('GOOGLE_AI_API_KEY');
      // `gemini-2.0-flash` is not served to every key — it answers 404 on some,
      // where `gemini-flash-latest` resolves to whatever that key may call.
      const model = env('AI_INSIGHT_MODEL') || 'gemini-flash-latest';
      // The key goes in a header, not the query string: a URL travels through
      // logs and error reports that a header does not.
      const request = () => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1024, ...(json ? { responseMimeType: 'application/json' } : {}) },
        }),
        signal,
      });
      // Gemini sheds load with a 503 often enough that one attempt is not a
      // fair test of whether it is working — two of three tries were refused
      // while this was being wired up. One retry, then take the answer.
      let response = await request();
      if (response.status === 503 || response.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        response = await request();
      }
      if (!response.ok) throw refusedBy('gemini', response.status);
      const payload = await response.json();
      return (payload?.candidates?.[0]?.content?.parts || []).map((part) => part?.text || '').join('');
    },
  },
  {
    name: 'n8n',
    configured: () => !!env('N8N_AI_WEBHOOK_URL'),
    async complete(prompt, signal, tenantId) {
      // Byte for byte the payload the storefront assistant sends. A workflow is
      // built to a shape, and this was sending its own — no `tenant`, and a
      // `source` the workflow had never heard of — which came back as an error
      // and read on the dashboard as the whole service being down.
      const response = await fetch(env('N8N_AI_WEBHOOK_URL'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': env('N8N_AI_API_KEY') },
        body: JSON.stringify({ message: prompt, tenant: tenantId || '', source: 'storefront' }),
        signal,
      });
      if (!response.ok) return null;
      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); } catch { return raw; }
      // A workflow may answer with the array directly, or wrap it the way the
      // chat webhook does.
      if (Array.isArray(data)) return JSON.stringify(data);
      return String(data?.reply || data?.output || data?.text || data?.response || raw);
    },
  },
];

/**
 * Every provider this shop is set up for, in the order they should be tried.
 *
 * This used to return the first configured one and stop there, which meant a
 * shop with a dead OpenAI key and a working Gemini key got an empty panel:
 * `complete()` answered null, `generateInsights` reported `upstream_error`,
 * and the provider sitting right behind it was never asked. The failure looked
 * identical to having configured nothing at all, so the obvious next move —
 * adding another key — changed nothing, because the broken one still won the
 * race to be first.
 *
 * `AI_INSIGHT_PROVIDER` still pins exactly one. Naming a provider is a
 * decision, and falling back off a decision would make that setting a
 * suggestion.
 */
function resolveProviders() {
  const wanted = env('AI_INSIGHT_PROVIDER').toLowerCase();
  if (wanted) return PROVIDERS.filter((p) => p.name === wanted && p.configured());
  return PROVIDERS.filter((p) => p.configured());
}

export function aiInsightsConfigured() {
  return resolveProviders().length > 0;
}

/** Which back ends this shop could use, for the console to show. */
export function aiProviderNames() {
  return resolveProviders().map((p) => p.name);
}

let cached = null;

/** A compact, number-only view of the report. Keeps the prompt cheap and factual. */
function brief(report) {
  const s = report.summary || {}, f = report.funnel || {};
  return {
    visitors: s.visitors || 0,
    new_visitors: s.new_visitors || 0,
    returning_visitors: s.returning_visitors || 0,
    pageviews: s.pageviews || 0,
    sessions: s.sessions || 0,
    funnel: { product_views: f.product_views || 0, add_to_cart: f.add_to_cart || 0, checkout: f.checkout || 0, purchases: f.purchases || 0 },
    daily: (report.daily || []).slice(-30),
    top_pages: (report.top_pages || []).slice(0, 8),
    most_viewed_products: (report.top_products || []).slice(0, 8).map((p) => ({ name: p.name || p.product_id, views: p.views })),
  };
}

function fingerprint(report) {
  const s = report.summary || {}, f = report.funnel || {};
  return [s.visitors, s.pageviews, s.sessions, f.product_views, f.add_to_cart, f.checkout, f.purchases, (report.daily || []).at(-1)?.date].join('|');
}

function buildPrompt(data) {
  return [
    'คุณเป็นนักวิเคราะห์ข้อมูลของร้านค้าออนไลน์ไทย',
    'วิเคราะห์ข้อมูลสรุปด้านล่างแล้วตอบเป็น JSON array ความยาว 3-4 รายการ',
    'แต่ละรายการมีรูปแบบ {"type":"...","title":"...","text":"..."}',
    'ค่า type ต้องเป็นหนึ่งใน: bestseller (สินค้าขายดี), warning (คนดูเยอะแต่ไม่ซื้อ), trend (กำลังเติบโต), opportunity (โอกาสพัฒนา)',
    'title คือข้อสรุปพร้อมตัวเลข ยาวไม่เกิน 70 ตัวอักษร เช่นชื่อสินค้าตามด้วยยอดที่วัดได้',
    'text คือสิ่งที่เจ้าของร้านควรทำต่อ ยาวไม่เกิน 180 ตัวอักษร',
    'ใช้เฉพาะตัวเลขและชื่อสินค้าที่ปรากฏในข้อมูลเท่านั้น ห้ามเดาหรือสร้างตัวเลขขึ้นเอง',
    'ถ้าข้อมูลไม่พอสำหรับ type ใด ให้ข้ามไป อย่าแต่งเรื่องขึ้นมาให้ครบ',
    'เขียนเป็นภาษาไทย ตอบเป็น JSON array อย่างเดียว ไม่ต้องมีคำอธิบายอื่น',
    '',
    JSON.stringify(data),
  ].join('\n');
}

/** The array out of whatever the provider wrapped it in, or null. */
function parseInsights(text) {
  const match = String(text || '').match(/\[[\s\S]*\]/);
  if (!match) return null;
  let parsed;
  try { parsed = JSON.parse(match[0]); } catch { return null; }
  if (!Array.isArray(parsed)) return null;
  return parsed
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      type: TYPES.has(String(item.type)) ? String(item.type) : 'opportunity',
      title: String(item.title || '').slice(0, 120),
      text: String(item.text || item.description || '').slice(0, 400),
    }))
    .filter((item) => item.text)
    .slice(0, 4);
}

/**
 * One provider's attempt. Returns insights, or the reason it could not.
 *
 * Split out of `generateInsights` so the loop below can try the next one
 * without the retry logic and the prompt-building getting tangled together.
 */
async function attempt(provider, data, tenantId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const text = await provider.complete(buildPrompt(data), controller.signal, tenantId);
    if (text === null) return { status: 'upstream_error' };
    const parsed = parseInsights(text);
    if (parsed && parsed.length) return { status: 'ok', insights: parsed };

    // A merchant's own workflow is whatever they built, and most of them are
    // wired to answer a customer in prose. Throwing that away leaves an empty
    // panel with a working provider behind it, so an answer that is plainly an
    // answer is shown as one. It is still the model's own words about the
    // figures it was given — nothing here composes a number.
    const prose = String(text || '').trim();
    if (!prose) return { status: 'empty_reply' };
    if (provider.name !== 'n8n' || prose.length < 12) return { status: 'unparsable' };
    return { status: 'prose', insights: [{ type: 'opportunity', title: 'บทวิเคราะห์จาก n8n', text: prose.slice(0, 400) }] };
  } catch {
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * An answer for a customer in the shop's chat, from whichever back end works.
 *
 * The storefront assistant goes to the merchant's own n8n workflow first and
 * always will: it is the one that can be wired to the shop's real data. But a
 * workflow that returns nothing — which is what this shop's is doing today,
 * answering `[]` to every message — used to end the conversation with an
 * error, while a configured Gemini key sat unused three lines away.
 *
 * n8n is excluded here rather than retried: the caller has already asked it,
 * and asking twice would double the delay in front of a customer who is
 * waiting.
 *
 * The caller may attach a small catalogue slice. It is treated as quoted shop
 * data: the model can explain those products, but it must never fill gaps with
 * an invented SKU, price, stock count, or delivery promise.
 */
export async function chatFallback({ message, history = [], context = '' } = {}) {
  const providers = resolveProviders().filter((p) => p.name !== 'n8n');
  if (!String(message || '').trim()) return { reply: null, provider: null, attempts: [] };
  // "Nothing is configured" is a different answer from "everything refused",
  // and whoever is trying to fix it has to be able to tell them apart.
  if (!providers.length) return { reply: null, provider: null, attempts: [{ provider: 'none', error: 'not_configured' }] };

  const conversation = (Array.isArray(history) ? history : [])
    .slice(-8)
    .map((turn) => `${turn?.role === 'ai' ? 'ผู้ช่วย' : 'ลูกค้า'}: ${String(turn?.text || '').slice(0, 600)}`)
    .join('\n');

  const prompt = [
    'คุณเป็นผู้ช่วยตอบแชทของร้าน THAISERKIT SUPPLY ร้านขายเครื่องมือช่างและอุปกรณ์การเกษตรในประเทศไทย',
    'ตอบเป็นภาษาไทย สุภาพ กระชับ ไม่เกิน 3 ประโยค',
    'ใช้ข้อมูลสินค้าที่แนบให้เท่านั้น ห้ามเดา SKU ราคา สต็อก หรือระยะเวลาจัดส่งที่ไม่มีในข้อมูล',
    'ถ้าลูกค้าถามเรื่องสถานะคำสั่งซื้อ การคืนสินค้า หรือข้อมูลที่ไม่มีในบริบท ให้ตอบสั้น ๆ แล้วบอกว่ากำลังส่งต่อให้เจ้าหน้าที่',
    context ? `ข้อมูลของลูกค้าคนนี้:\n${context}` : '',
    conversation ? `บทสนทนาก่อนหน้า:\n${conversation}` : '',
    `ลูกค้าถาม: ${String(message).slice(0, 2000)}`,
  ].filter(Boolean).join('\n\n');

  /**
   * Why each provider did not answer.
   *
   * This loop used to be `catch {}` and a bare `null`, so every failure
   * looked identical to "no provider is configured" — which is how the shop
   * spent a day with a chat box that said nothing and an owner who could
   * only report that "AI ใช้ไม่ได้". A key that expired, a model name the
   * API rejected, and a provider nobody had configured were three different
   * problems wearing the same silence.
   *
   * Classes, never contents. `http_401` is the diagnosis; the response body
   * that carries it can quote the request back, and the request carries the
   * key.
   */
  const attempts = [];
  for (const provider of providers) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const text = await provider.complete(prompt, controller.signal, '', { json: false });
      const reply = String(text || '').trim();
      if (reply) return { reply: reply.slice(0, 2000), provider: provider.name, attempts };
      attempts.push({ provider: provider.name, error: 'empty_reply' });
    } catch (error) {
      attempts.push({ provider: provider.name, error: failureClass(error) });
    } finally {
      clearTimeout(timeout);
    }
  }
  return { reply: null, provider: null, attempts };
}

/**
 * An error, reduced to something safe to show.
 *
 * A provider's own message is not safe to forward: these APIs quote the
 * failing request back and the failing request carries the key. What is
 * wanted is the class — whether the key was refused, the model was wrong, or
 * nothing answered at all — and that fits in one word.
 */
function failureClass(error) {
  const name = String(error?.name || '');
  if (name === 'AbortError' || name === 'TimeoutError') return 'timeout';
  const status = Number(error?.status || (String(error?.message || '').match(/\b(\d{3})\b/) || [])[1]);
  if (status >= 400 && status < 600) return `http_${status}`;
  if (/fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(String(error?.message || ''))) return 'unreachable';
  return 'failed';
}

export async function generateInsights(report, { tenantId = '' } = {}) {
  const providers = resolveProviders();
  if (!providers.length) return { insights: [], status: 'not_configured', provider: null, attempts: [] };

  const data = brief(report);
  if (!data.visitors && !data.pageviews) {
    return { insights: [], status: 'no_data', provider: providers[0].name, attempts: [] };
  }

  // Keyed on the report rather than on the provider, because which provider
  // answers is now an implementation detail that can change between two calls
  // about the same figures — and the answer is about the figures.
  const print = fingerprint(report);
  if (cached && cached.print === print && Date.now() - cached.at < CACHE_TTL_MS) {
    return { insights: cached.insights, status: 'cached', provider: cached.provider, attempts: [] };
  }

  // Every attempt is recorded, including the ones that worked, so the console
  // can say "OpenAI failed, Gemini answered" instead of leaving an operator to
  // guess which of their three keys is the dead one.
  const attempts = [];
  for (const provider of providers) {
    const result = await attempt(provider, data, tenantId);
    attempts.push({ provider: provider.name, status: result.status });
    if (result.insights?.length) {
      cached = { print, insights: result.insights, provider: provider.name, at: Date.now() };
      return { insights: result.insights, status: result.status, provider: provider.name, attempts };
    }
  }

  // Nothing answered. The last reason is the one reported, because it is the
  // one from the provider furthest down the list — the shop's last resort.
  return { insights: [], status: attempts.at(-1).status, provider: attempts.at(-1).provider, attempts };
}
