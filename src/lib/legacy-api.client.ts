export type LegacyMethod = 'GET' | 'POST';

export class LegacyApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public detail?: unknown,
    public retryAfterMs = 0,
  ) {
    super(code);
    this.name = 'LegacyApiError';
  }
}

const RETRYABLE_GET_STATUS = new Set([429, 503]);
const MAX_GET_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 10_000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Parse Retry-After without allowing a server/proxy to freeze the browser for
 * an unbounded period. The legacy API uses integer seconds, but RFC date values
 * are supported as well for proxies/CDNs.
 */
export function retryAfterMs(value: string | null, now = Date.now()) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_AFTER_MS, Math.round(seconds * 1000));
  }
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return 0;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, at - now));
}

function requestUrl(action: string, params: Record<string, unknown>, method: LegacyMethod) {
  if (method !== 'GET') return `/api?action=${encodeURIComponent(action)}`;
  const query = new URLSearchParams();
  query.set('action', action);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((item) => query.append(key, String(item)));
    else query.set(key, String(value));
  }
  return `/api?${query.toString()}`;
}

/**
 * Browser compatibility client for the preserved business API.
 *
 * GET requests may safely retry 429/503 responses and honour Retry-After.
 * Mutating requests are deliberately never retried here because not every
 * legacy action is idempotent; duplicate orders/payments are worse than a
 * visible retry button.
 */
export async function legacyRequest<T>(
  action: string,
  params: Record<string, unknown> = {},
  method: LegacyMethod = 'GET',
) {
  const url = requestUrl(action, params, method);
  const attempts = method === 'GET' ? MAX_GET_RETRIES + 1 : 1;
  let lastError: LegacyApiError | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const init: RequestInit = {
      method,
      credentials: 'include',
      headers: { accept: 'application/json' },
      cache: method === 'GET' ? 'no-store' : undefined,
    };
    if (method === 'POST') {
      init.headers = { ...init.headers, 'content-type': 'application/json' };
      init.body = JSON.stringify({ action, ...params });
    }

    try {
      const response = await fetch(url, init);
      const data = await response.json().catch(() => ({ ok: false, error: `http_${response.status}` }));
      if (response.ok && data?.ok !== false) return data as T;

      const wait = retryAfterMs(response.headers.get('retry-after'));
      const error = new LegacyApiError(
        response.status,
        String(data?.error || `http_${response.status}`),
        data,
        wait,
      );
      lastError = error;

      const canRetry = method === 'GET' && RETRYABLE_GET_STATUS.has(response.status) && attempt + 1 < attempts;
      if (!canRetry) throw error;
      await sleep(wait || Math.min(2000, 400 * 2 ** attempt));
    } catch (error) {
      if (error instanceof LegacyApiError) {
        if (lastError === error && method === 'GET' && RETRYABLE_GET_STATUS.has(error.status) && attempt + 1 < attempts) continue;
        throw error;
      }
      // One bounded retry for an interrupted anonymous/read request. POST is
      // intentionally not retried because its side effect may already exist.
      if (method === 'GET' && attempt + 1 < attempts) {
        await sleep(Math.min(2000, 400 * 2 ** attempt));
        continue;
      }
      throw error;
    }
  }

  throw lastError || new LegacyApiError(503, 'request_failed');
}
