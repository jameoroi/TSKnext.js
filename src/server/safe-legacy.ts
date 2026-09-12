import 'server-only';
import { serverLegacyRequest } from './legacy-api';

export async function safeLegacy<T>(action: string, params: Record<string, unknown> = {}, fallback: T, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  try { return await serverLegacyRequest<T>(action, params, method); }
  catch (error) {
    console.warn(`[next-migration] ${action} failed`, error instanceof Error ? error.message : error);
    return fallback;
  }
}
