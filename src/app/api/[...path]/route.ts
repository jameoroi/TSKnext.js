import legacyApi from '@/legacy-api/api.js';
import { revalidatePublicStorefront } from '@/server/public-cache-invalidation';

async function requestAction(request: Request) {
  const urlAction = new URL(request.url).searchParams.get('action');
  if (urlAction) return urlAction;
  if (request.method === 'GET' || request.method === 'HEAD') return '';
  const body = await request.clone().json().catch(() => null) as { action?: unknown } | null;
  return typeof body?.action === 'string' ? body.action : '';
}

async function handler(request: Request) {
  const action = await requestAction(request);
  const response = await legacyApi(request);
  if (response.ok && request.method !== 'GET' && request.method !== 'HEAD' && action) {
    revalidatePublicStorefront(action);
  }
  return response;
}
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
