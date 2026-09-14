import { withDb } from '@/server/db/client';
import { aiUsageLogs } from '@/server/db/schema';

type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

type AiUsageInput = {
  feature: string;
  provider: string;
  model?: string;
  usage?: Usage;
  latencyMs: number;
  fallback?: boolean;
  metadata?: Record<string, unknown>;
  tenantId?: string;
};

function safeInt(value: unknown) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 2_000_000_000) : 0;
}

/** Best-effort telemetry: an observability failure must never break checkout/chat. */
export async function logAiUsage(input: AiUsageInput) {
  const usage = input.usage || {};
  const inputTokens = safeInt(usage.inputTokens);
  const outputTokens = safeInt(usage.outputTokens);
  const totalTokens = safeInt(usage.totalTokens) || inputTokens + outputTokens;
  const tenantId = String(input.tenantId || process.env.DEFAULT_TENANT_ID || '').trim();
  if (!tenantId) return;
  try {
    await withDb((db) =>
      db.insert(aiUsageLogs).values({
        id: crypto.randomUUID(),
        tenantId,
        feature: input.feature.slice(0, 120),
        provider: input.provider.slice(0, 80),
        model: input.model?.slice(0, 120),
        inputTokens,
        outputTokens,
        totalTokens,
        latencyMs: safeInt(input.latencyMs),
        fallback: Boolean(input.fallback),
        metadata: input.metadata || {},
      }),
    );
  } catch (error) {
    console.warn('[ai] usage log unavailable', error instanceof Error ? error.message : error);
  }
}
