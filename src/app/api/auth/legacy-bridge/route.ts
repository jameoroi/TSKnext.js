import { NextResponse } from 'next/server';
import { establishOauthCustomerSession } from '@/legacy-api/api.js';

function safePath(value: string | null, fallback = '/account') {
  const path = String(value || '').trim();
  return path.startsWith('/') && !path.startsWith('//') ? path : fallback;
}

function loginErrorUrl(request: Request, code: string, redirect: string) {
  const url = new URL('/login', request.url);
  url.searchParams.set('oauth_error', code || 'oauth_failed');
  if (redirect && redirect !== '/account') url.searchParams.set('redirect', redirect);
  return url;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirect = safePath(url.searchParams.get('redirect'));
  if (process.env.NODE_ENV === 'production' && String(process.env.AUTH_SECRET || '').length < 32) {
    return NextResponse.redirect(loginErrorUrl(request, 'auth_not_configured', redirect));
  }

  const { auth } = await import('@/auth');
  const session = await auth();
  const user = session?.user;
  const provider = String(user?.authProvider || '');
  const providerAccountId = String(user?.providerAccountId || '');

  if (!user || !provider || !providerAccountId) {
    return NextResponse.redirect(loginErrorUrl(request, 'oauth_session_missing', redirect));
  }

  try {
    const result = (await establishOauthCustomerSession(request, {
      provider,
      providerAccountId,
      email: user.email || '',
      name: user.name || '',
      emailVerified: user.authEmailVerified === true,
    })) as unknown as { ok?: boolean; error?: unknown; cookie?: unknown };
    if (!result?.ok || typeof result.cookie !== 'string') {
      return NextResponse.redirect(loginErrorUrl(request, String(result?.error || 'oauth_failed'), redirect));
    }

    const response = NextResponse.redirect(new URL(redirect, request.url));
    response.headers.append('set-cookie', result.cookie);
    response.headers.set('cache-control', 'no-store');
    return response;
  } catch (error) {
    console.error('[oauth-legacy-bridge]', error);
    return NextResponse.redirect(loginErrorUrl(request, 'oauth_bridge_unavailable', redirect));
  }
}
