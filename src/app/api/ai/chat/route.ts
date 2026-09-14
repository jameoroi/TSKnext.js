import { streamText } from 'ai';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/legacy-api/api.js';
import { aiSdkOpenAI } from '@/lib/ai';
import { logAiUsage } from '@/server/ai-usage';
import { getProducts } from '@/server/catalog';
import { safePublicLegacy } from '@/server/public-legacy-cache';
import { resolveRequestTenant } from '@/server/request-tenant';

const schema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string().max(12000) }))
    .min(1)
    .max(50),
});
export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ ok: false, error: 'invalid_input' }, { status: 422 });

  const tenant = resolveRequestTenant(request);
  const rl = await rateLimit(request, 'ai-chat', 120, 3600, tenant.ok ? tenant.tenant.id : '');
  if (!rl.ok) {
    const retryAfter = 'retry_after' in rl && typeof rl.retry_after === 'number' ? rl.retry_after : 3600;
    return Response.json({ ok: false, error: 'rate_limited', retry_after: retryAfter }, { status: 429 });
  }

  // The schema accepts a `system` role, but client-supplied system messages
  // are passed straight into the model call below alongside our own system
  // prompt — a prompt-injection primitive. Coerce them to user messages so
  // the model treats caller text as data, never as instructions.
  const safeMessages = body.data.messages
    .filter((message) => message.role === 'user' || message.role === 'assistant' || message.role === 'system')
    .map((message) => ({
      role: message.role === 'system' ? ('user' as const) : message.role,
      content: message.content,
    }));
  if (!safeMessages.length) return Response.json({ ok: false, error: 'invalid_input' }, { status: 422 });
  const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
  const provider = aiSdkOpenAI();
  if (!provider) {
    void logAiUsage({
      feature: 'customer-chat',
      provider: 'rule-engine',
      model,
      latencyMs: Date.now() - startedAt,
      fallback: true,
    });
    return Response.json({ ok: false, error: 'ai_not_configured' }, { status: 503 });
  }

  const query =
    [...safeMessages]
      .reverse()
      .find((message) => message.role === 'user')
      ?.content.slice(0, 240) || '';
  const [catalog, faq] = await Promise.all([
    getProducts({ page: 1, per_page: 8, q: query }),
    safePublicLegacy<{ items?: Array<Record<string, unknown>> }>(
      'content.list',
      { kind: 'faq' },
      { items: [] },
    ),
  ]);
  const productContext = catalog.products.map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price,
    available: product.available,
    sku: product.sku,
  }));
  const faqContext = (faq.items || [])
    .slice(0, 8)
    .map((item) => ({ title: item.title, summary: item.summary, content: item.content }));
  const system = `You are THAISERKIT SUPPLY commerce assistant. Answer in Thai when the customer uses Thai. Never invent inventory, price, order or customer data. The following is retrieved live context; if it is empty or does not answer the question, say you cannot verify it and direct the customer to staff.\n\nCATALOGUE:\n${JSON.stringify(productContext)}\n\nFAQ:\n${JSON.stringify(faqContext)}`;
  const result = streamText({ model: provider(model), messages: safeMessages, system });
  void result.usage
    .then((usage) =>
      logAiUsage({
        feature: 'customer-chat-rag',
        provider: 'openai',
        model,
        usage,
        latencyMs: Date.now() - startedAt,
        metadata: { retrievedProducts: productContext.length, retrievedFaq: faqContext.length },
      }),
    )
    .catch(() => undefined);
  return result.toTextStreamResponse();
}
