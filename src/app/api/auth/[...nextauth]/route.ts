import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function authIsConfigured() {
  return process.env.NODE_ENV !== 'production' || String(process.env.AUTH_SECRET || '').length >= 32;
}

async function dispatch(method: 'GET' | 'POST', request: NextRequest) {
  if (!authIsConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'auth_not_configured',
        message: 'Authentication is unavailable until AUTH_SECRET is configured.',
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }

  const { handlers } = await import('@/auth');
  return handlers[method](request);
}

export const GET = (request: NextRequest) => dispatch('GET', request);
export const POST = (request: NextRequest) => dispatch('POST', request);
