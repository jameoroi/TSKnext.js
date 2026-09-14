import legacyApi from '@/legacy-api/api.js';
import { storageBackend } from '@/legacy-api/lib/storage.js';
import { revalidatePublicStorefront } from '@/server/public-cache-invalidation';

function emptyPublicRead(action: string) {
  switch (action) {
    case 'site.settings':
      return { settings: {} };
    case 'categories.list':
      return { categories: [] };
    case 'brands.list':
      return { brands: [] };
    case 'products.list':
      return { products: [], total: 0 };
    case 'products.get':
      return { product: null, error: 'not_found' };
    case 'products.recommend':
      return { recommendations: [] };
    case 'content.list':
      return { items: [] };
    default:
      return null;
  }
}

async function requestAction(request: Request) {
  const urlAction = new URL(request.url).searchParams.get('action');
  if (urlAction) return urlAction;
  if (request.method === 'GET' || request.method === 'HEAD') return '';
  const body = (await request
    .clone()
    .json()
    .catch(() => null)) as { action?: unknown } | null;
  return typeof body?.action === 'string' ? body.action : '';
}

async function handler(request: Request) {
  const action = await requestAction(request);
  const fallback =
    request.method === 'GET' && storageBackend() === 'not-configured' ? emptyPublicRead(action) : null;
  if (fallback) {
    return Response.json(
      { ok: true, ...fallback, source: 'empty-commerce-storage' },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

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
