import { generateText } from 'ai';
import { z } from 'zod';
import { aiSdkOpenAI } from '@/lib/ai';
import { getProducts } from '@/server/catalog';
import { logAiUsage } from '@/server/ai-usage';

const schema = z.object({
  job: z.string().trim().min(2).max(500),
  budget: z.coerce.number().min(0).max(10_000_000).default(0),
  level: z.enum(['beginner', 'pro', 'expert']).default('beginner'),
  brand: z.string().trim().max(100).optional().default(''),
  owned: z.string().trim().max(1000).optional().default(''),
  notes: z.string().trim().max(1000).optional().default(''),
});

type Candidate = {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  available: number;
  sku: string;
  specs: Record<string, unknown>;
};

function text(value: unknown) {
  return String(value || '').toLowerCase();
}
function tokens(value: string) {
  return text(value)
    .split(/[\s,./|;:()\[\]{}\-_]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function scoreCandidate(product: Candidate, request: z.infer<typeof schema>) {
  const haystack = text(
    [product.name, product.brand, product.category, product.sku, JSON.stringify(product.specs || {})].join(
      ' ',
    ),
  );
  let score = 0;
  for (const token of tokens(`${request.job} ${request.notes}`)) {
    if (haystack.includes(token)) score += token.length >= 5 ? 5 : 3;
  }
  if (request.brand && text(product.brand).includes(text(request.brand))) score += 9;
  if (product.available > 0) score += 2;
  if (request.level === 'beginner' && product.price > 0) score += 1;
  if (
    request.level === 'expert' &&
    /pro|brushless|heavy|industrial|professional|ไร้แปรง|งานหนัก/.test(haystack)
  )
    score += 3;
  return score;
}

function ruleBased(request: z.infer<typeof schema>, candidates: Candidate[]) {
  const owned = tokens(request.owned || '');
  const sorted = candidates
    .filter((row) => row.available > 0 && row.price > 0)
    .filter((row) => !owned.some((token) => text(row.name).includes(token)))
    .map((row) => ({ row, score: scoreCandidate(row, request) }))
    .sort((a, b) => b.score - a.score || a.row.price - b.row.price);

  const budget = request.budget > 0 ? request.budget : Number.POSITIVE_INFINITY;
  const picked: Array<{
    id: string;
    qty: number;
    reason: string;
    priority: 'essential' | 'recommended' | 'optional';
  }> = [];
  let total = 0;
  const categorySeen = new Set<string>();

  for (const entry of sorted) {
    if (!entry.score && picked.length >= 3) break;
    if (picked.length >= 8) break;
    if (total + entry.row.price > budget && picked.length >= 2) continue;
    const category = entry.row.category || 'ทั่วไป';
    if (categorySeen.has(category) && picked.length >= 4) continue;
    categorySeen.add(category);
    total += entry.row.price;
    picked.push({
      id: entry.row.id,
      qty: 1,
      reason: entry.score > 0 ? `ตรงกับงาน “${request.job}” และอยู่ในสต็อก` : 'เป็นอุปกรณ์พื้นฐานที่ใช้งานร่วมกับชุดนี้ได้',
      priority: picked.length < 3 ? 'essential' : picked.length < 6 ? 'recommended' : 'optional',
    });
  }

  return {
    ok: true,
    title: `ชุดอุปกรณ์สำหรับ ${request.job}`,
    summary:
      request.budget > 0
        ? `คัดจากสินค้าที่มีสต็อกจริงและพยายามให้อยู่ในงบ ${request.budget.toLocaleString('th-TH')} บาท`
        : 'คัดจากสินค้าที่มีสต็อกจริง โดยยังไม่ได้จำกัดงบประมาณ',
    budget: request.budget,
    total,
    remaining: request.budget > 0 ? request.budget - total : 0,
    items: picked,
    warnings: picked.length ? [] : ['ยังไม่พบสินค้าที่เหมาะสมจากแคตตาล็อกปัจจุบัน'],
    source: 'rules' as const,
  };
}

function extractJson(value: string) {
  const trimmed = value
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('ai_invalid_json');
  return JSON.parse(trimmed.slice(start, end + 1));
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { ok: false, error: 'invalid_input', issues: parsed.error.flatten() },
      { status: 422 },
    );

  const requestData = parsed.data;
  const catalog = await getProducts({ page: 1, per_page: 160, status: 'active' });
  const candidates: Candidate[] = catalog.products
    .map((product) => ({
      id: String(product.id),
      name: String(product.name || ''),
      brand: String(product.brand || ''),
      category: String(product.category || ''),
      price: Number(product.price || 0),
      available: Number(product.available ?? product.stock ?? 0),
      sku: String(product.sku || ''),
      specs: product.specs && typeof product.specs === 'object' ? product.specs : {},
    }))
    .filter((product) => product.id && product.name && product.price >= 0);

  const fallback = ruleBased(requestData, candidates);
  if (!candidates.length) {
    void logAiUsage({
      feature: 'kit-planner',
      provider: 'rule-engine',
      latencyMs: Date.now() - startedAt,
      fallback: true,
      metadata: { reason: 'empty-catalogue' },
    });
    return Response.json(
      { ...fallback, warnings: ['ยังโหลดแคตตาล็อกสินค้าไม่ได้ กรุณาตรวจการเชื่อมต่อ API / DATABASE'] },
      { status: 503 },
    );
  }

  const provider = aiSdkOpenAI();
  if (!provider) {
    void logAiUsage({
      feature: 'kit-planner',
      provider: 'rule-engine',
      model: process.env.OPENAI_MODEL,
      latencyMs: Date.now() - startedAt,
      fallback: true,
      metadata: { reason: 'provider-not-configured' },
    });
    return Response.json(fallback);
  }

  const compact = candidates
    .slice(0, 120)
    .map(({ specs, ...row }) => ({ ...row, specs: Object.entries(specs).slice(0, 8) }));
  try {
    const result = await generateText({
      model: provider(process.env.OPENAI_MODEL || 'gpt-5-mini'),
      temperature: 0.2,
      prompt: `You are the equipment-set planner for THAISERKIT SUPPLY. Select ONLY product ids from the provided live catalogue. Never invent a product, price, stock, SKU or brand. Prefer in-stock products and respect the budget when it is greater than zero. Avoid items the customer already owns. Balance essential tools, recommended supporting items and optional upgrades.\n\nCustomer request:\n${JSON.stringify(requestData)}\n\nLive catalogue candidates:\n${JSON.stringify(compact)}\n\nReturn ONLY valid JSON with this exact shape:\n{"title":"...","summary":"...","items":[{"id":"catalog-id","qty":1,"reason":"Thai explanation","priority":"essential|recommended|optional"}],"warnings":["..."]}`,
    });
    void logAiUsage({
      feature: 'kit-planner',
      provider: 'openai',
      model: process.env.OPENAI_MODEL || 'gpt-5-mini',
      usage: result.usage,
      latencyMs: Date.now() - startedAt,
      metadata: { candidates: candidates.length },
    });
    const raw = extractJson(result.text);
    const allowed = new Map(candidates.map((row) => [row.id, row]));
    const seen = new Set<string>();
    const items = Array.isArray(raw.items)
      ? raw.items.flatMap((entry: any) => {
          const id = String(entry?.id || '');
          const candidate = allowed.get(id);
          if (!candidate || seen.has(id) || candidate.available <= 0) return [];
          seen.add(id);
          return [
            {
              id,
              qty: Math.max(1, Math.min(candidate.available || 1, Math.trunc(Number(entry?.qty) || 1))),
              reason: String(entry?.reason || 'AI เลือกจากความเหมาะสมกับงาน').slice(0, 500),
              priority: ['essential', 'recommended', 'optional'].includes(String(entry?.priority))
                ? entry.priority
                : 'recommended',
            },
          ];
        })
      : [];
    if (!items.length) return Response.json(fallback);
    let total = 0;
    const budgeted = [];
    for (const item of items) {
      const candidate = allowed.get(item.id)!;
      const line = candidate.price * item.qty;
      if (requestData.budget > 0 && total + line > requestData.budget && budgeted.length >= 2) continue;
      total += line;
      budgeted.push(item);
    }
    return Response.json({
      ok: true,
      title: String(raw.title || fallback.title).slice(0, 200),
      summary: String(raw.summary || fallback.summary).slice(0, 1000),
      budget: requestData.budget,
      total,
      remaining: requestData.budget > 0 ? requestData.budget - total : 0,
      items: budgeted,
      warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String).slice(0, 8) : [],
      source: 'ai',
    });
  } catch (error) {
    console.warn(
      '[kits.ai] falling back to deterministic planner',
      error instanceof Error ? error.message : error,
    );
    void logAiUsage({
      feature: 'kit-planner',
      provider: 'rule-engine',
      model: process.env.OPENAI_MODEL,
      latencyMs: Date.now() - startedAt,
      fallback: true,
      metadata: { reason: 'provider-error' },
    });
    return Response.json({
      ...fallback,
      warnings: [...fallback.warnings, 'AI ไม่พร้อมใช้งานชั่วคราว ระบบจึงจัดชุดด้วยกฎจากแคตตาล็อกแทน'],
    });
  }
}
