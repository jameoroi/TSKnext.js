/**
 * The shape of a rejected API call, and the one place that narrows it.
 *
 * Every `catch` in the app was written as `catch (error: any)` and then reached
 * straight into `error.data.error`. That works until the throw is something
 * else — an `AbortError` from a timeout, a `TypeError` from an offline device,
 * a string from a library — at which point `any` silences the compiler and the
 * page shows whatever `undefined || fallback` produces, or throws a second time
 * inside the handler that was meant to recover.
 *
 * A `catch` binding is genuinely `unknown`: anything at all can be thrown, and
 * TypeScript is right to say so. So the type is not widened at the catch site;
 * it is narrowed here instead, once, where the shapes are written down.
 *
 * `$fetch` (ofetch) rejects with a FetchError that carries the parsed response
 * body on `.data`, and some call sites see it on `.response._data` instead, so
 * both are checked.
 */

/**
 * One line of `checkout.stock.validate`'s refusal: the cart cannot be paid for
 * because this item is short, or is no longer sold.
 */
export interface StockProblem {
  type?: string;
  name?: string;
  requested?: number;
  available?: number;
}

/** The JSON body this API returns alongside a non-2xx status. */
export interface ApiErrorBody {
  error?: string;
  retry_after?: number;
  problems?: StockProblem[];
  [key: string]: unknown;
}

/** What a failed request looks like once narrowed. */
export interface NarrowedApiError {
  /** The API's own error code, e.g. `rate_limited`. Empty when there is no body. */
  code: string;
  /** The thrown value's message, or '' when it has none. */
  message: string;
  /** The constructor name, e.g. `AbortError` on a timeout. */
  name: string;
  /** The parsed response body, when there was one. */
  body: ApiErrorBody;
  /** HTTP status, when the throw carried one. */
  status: number;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

/**
 * Narrow a caught value into the fields the handlers actually read.
 *
 * Never throws and never returns undefined: a handler that is already dealing
 * with a failure must not have to guard its own recovery path.
 */
export function apiError(error: unknown): NarrowedApiError {
  const thrown = record(error);
  const body = { ...record(record(thrown.response)._data), ...record(thrown.data) } as ApiErrorBody;
  return {
    code: String(body.error ?? ''),
    message: typeof thrown.message === 'string' ? thrown.message : '',
    name: typeof thrown.name === 'string' ? thrown.name : '',
    body,
    status: Number(thrown.statusCode ?? thrown.status ?? 0) || 0,
  };
}

/** The API's error code, or '' when the failure carried no body. */
export function apiErrorCode(error: unknown): string {
  return apiError(error).code;
}

/**
 * Something safe to show a person.
 *
 * Prefers the caller's wording: an API code like `stock_unavailable` is for
 * branching on, not for reading, so the fallback wins unless there is nothing
 * else at all.
 */
export function apiErrorText(error: unknown, fallback: string): string {
  const narrowed = apiError(error);
  if (narrowed.name === 'AbortError' || narrowed.name === 'TimeoutError') return fallback;
  return fallback || narrowed.message;
}

/** For logging: the message if there is one, else whatever was thrown. */
export function apiErrorDetail(error: unknown): unknown {
  return apiError(error).message || error;
}
