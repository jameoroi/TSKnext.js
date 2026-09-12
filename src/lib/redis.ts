import IORedis from 'ioredis';

const globalForRedis = globalThis as typeof globalThis & { __tskRedis?: IORedis };

export function getRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
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
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function cacheSetJson(key: string, value: unknown, ttlSeconds = 60) {
  const redis = getRedis();
  if (!redis) return false;
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  return true;
}
