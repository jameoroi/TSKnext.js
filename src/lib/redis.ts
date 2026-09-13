import IORedis from 'ioredis';

const globalForRedis = globalThis as typeof globalThis & { __tskRedis?: IORedis };

type RedisRestConfig = { url: string; token: string };
type RedisRestResponse = { result?: unknown; error?: string };

let restBackoffUntil = 0;

function redisRestConfig(): RedisRestConfig | null {
  const configuredUrl = String(process.env.REDIS_REST_URL || process.env.REDIS_URL || '').trim();
  const token = String(process.env.REDIS_REST_TOKEN || '').trim();
  if (!/^https:\/\//i.test(configuredUrl) || !token) return null;
  return { url: configuredUrl.replace(/\/+$/, ''), token };
}

function activeRestConfig() {
  if (Date.now() < restBackoffUntil) return null;
  return redisRestConfig();
}

function markRestUnavailable() {
  // A bad/temporarily unavailable Redis must never turn a public page into a
  // slow page. Retry after a short cooldown while the in-process cache keeps
  // serving the request path.
  restBackoffUntil = Date.now() + 30_000;
}

async function redisRestCommand<T>(command: unknown[]): Promise<T | null> {
  const config = activeRestConfig();
  if (!config) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      markRestUnavailable();
      return null;
    }
    const payload = (await response.json()) as RedisRestResponse;
    if (payload.error) {
      markRestUnavailable();
      return null;
    }
    return (payload.result ?? null) as T | null;
  } catch {
    markRestUnavailable();
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function redisRestConfigured() {
  return Boolean(redisRestConfig());
}

export function redisConfigured() {
  return redisRestConfigured() || Boolean(String(process.env.REDIS_URL || '').trim());
}

export function getRedis() {
  const url = process.env.REDIS_URL;
  // ioredis uses raw TCP and is for the Node worker/runtime only. Cloudflare
  // Workers use the REST transport above when REDIS_REST_* is configured.
  if (!url || /^https:\/\//i.test(url)) return null;
  if (globalForRedis.__tskRedis) return globalForRedis.__tskRedis;
  const client = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });
  if (process.env.NODE_ENV !== 'production') globalForRedis.__tskRedis = client;
  return client;
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  if (redisRestConfigured()) {
    const value = await redisRestCommand<string>(['GET', key]);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  // Public request caching runs in the Cloudflare Worker. Never open a raw
  // TCP/ioredis connection from that path; use REST explicitly or skip the
  // remote cache and let the in-process cache/fallback handle the request.
  return null;
}

export async function cacheSetJson(key: string, value: unknown, ttlSeconds = 60) {
  if (redisRestConfigured()) {
    const result = await redisRestCommand<string>(['SET', key, JSON.stringify(value), 'EX', ttlSeconds]);
    return result === 'OK';
  }
  return false;
}

export async function redisHealth() {
  if (redisRestConfigured()) {
    const result = await redisRestCommand<string>(['PING']);
    return { configured: true, mode: 'rest' as const, reachable: result === 'PONG' };
  }
  const redis = getRedis();
  if (!redis) return { configured: false, mode: 'none' as const, reachable: false };
  return { configured: true, mode: 'tcp' as const, reachable: redis.status === 'ready' };
}
