import crypto from 'node:crypto';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Credentials from 'next-auth/providers/credentials';
import Facebook from 'next-auth/providers/facebook';
import Google from 'next-auth/providers/google';
import { z } from 'zod';
import legacyApi from '@/legacy-api/api.js';

const ENV_COMPARE_KEY = crypto.randomBytes(32);

export type AuthRole = 'owner' | 'admin' | 'agent' | 'supplier' | 'customer';

// Re-check the role against the commerce session at most this often, so a
// logged-out or demoted account loses its Auth.js role within minutes.
const ROLE_RECHECK_MS = 5 * 60 * 1000;

// Indexed access: read at request time. On Cloudflare Workers the values are
// Worker secrets that only exist at runtime, and a module-scope read can run
// before they are populated, which is how Google/Facebook/LINE went missing.
function env(name: string) {
  return String((process.env as Record<string, string | undefined>)[name] || '').trim();
}

type LegacyIdentity = { role: AuthRole; id: string; name: string; email: string };

/**
 * Resolve the signed-in commerce account (tsk_session) behind a request.
 * The legacy API validates the HttpOnly session cookie server-side; nothing
 * the browser sends is trusted beyond that cookie.
 */
async function legacyIdentity(request: Request | undefined): Promise<LegacyIdentity | null> {
  const cookie = request?.headers.get('cookie') || '';
  if (!request || !/(?:^|;\s*)tsk_session=/.test(cookie)) return null;
  const headers = new Headers({ cookie, accept: 'application/json' });
  for (const name of ['user-agent', 'accept-language', 'cf-connecting-ip', 'x-forwarded-for', 'x-real-ip']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const origin = new URL(request.url).origin;
    const response = await legacyApi(new Request(`${origin}/api?action=session`, { headers }));
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || !data?.ok) return null;
    if (data.admin) {
      const username = String(data.admin_username || 'admin');
      return {
        role: data.admin_role === 'super_admin' ? 'owner' : 'admin',
        id: `admin:${username}`,
        name: username,
        email: '',
      };
    }
    if (data.agent) {
      const profile = (data.agent_profile || {}) as Record<string, unknown>;
      return {
        role: 'agent',
        id: `agent:${String(profile.id || profile.agent_code || '')}`,
        name: String(profile.store_name || 'agent'),
        email: '',
      };
    }
    if (data.supplier) return { role: 'supplier', id: 'supplier', name: 'supplier', email: '' };
    if (data.customer) {
      const customer = data.customer as Record<string, unknown>;
      return {
        role: 'customer',
        id: `customer:${String(customer.id || '')}`,
        name: String(customer.name || ''),
        email: String(customer.email || ''),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function buildProviders(): Provider[] {
  const providers: Provider[] = [];

  if (env('AUTH_GOOGLE_ID') && env('AUTH_GOOGLE_SECRET')) {
    providers.push(Google({ clientId: env('AUTH_GOOGLE_ID'), clientSecret: env('AUTH_GOOGLE_SECRET') }));
  }
  if (env('AUTH_FACEBOOK_ID') && env('AUTH_FACEBOOK_SECRET')) {
    providers.push(
      Facebook({ clientId: env('AUTH_FACEBOOK_ID'), clientSecret: env('AUTH_FACEBOOK_SECRET') }),
    );
  }
  if (env('AUTH_LINE_ID') && env('AUTH_LINE_SECRET')) {
    providers.push({
      id: 'line',
      name: 'LINE',
      type: 'oidc',
      issuer: 'https://access.line.me',
      clientId: env('AUTH_LINE_ID'),
      clientSecret: env('AUTH_LINE_SECRET'),
      authorization: {
        url: 'https://access.line.me/oauth2/v2.1/authorize',
        params: { scope: 'openid profile email' },
      },
      token: 'https://api.line.me/oauth2/v2.1/token',
      userinfo: 'https://api.line.me/oauth2/v2.1/userinfo',
      profile(profile: Record<string, unknown>) {
        return {
          id: String(profile.sub || ''),
          name: String(profile.name || ''),
          email: profile.email ? String(profile.email) : null,
          image: profile.picture ? String(profile.picture) : null,
        };
      },
    } as Provider);
  }

  providers.push(
    Credentials({
      id: 'platform-credentials',
      name: 'Platform Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize(raw) {
        const input = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(raw);
        if (!input.success) return null;
        // Single shared platform secret (not a per-admin credential store).
        // Hardened, not replaced: constant-time comparison so trial timing leaks
        // nothing, and a minimum length matching the admin-password rule so a
        // short/weak value fails closed instead of guarding the platform.
        // NOTE: still no brute-force counter here — this endpoint must sit behind
        // an edge rate-limit rule (Cloudflare) in production. The legacy admin
        // login (admin-login-v2) already has storage-backed rate limiting.
        const expectedEmail = env('AUTH_PLATFORM_EMAIL');
        const expectedPassword = env('AUTH_PLATFORM_PASSWORD');
        if (!expectedEmail || !expectedPassword || expectedPassword.length < 14) return null;
        // Keyed HMAC with a per-isolate random key: equal-length digests for a
        // constant-time comparison, never a stored or reusable password hash.
        const digest = (value: string) => crypto.createHmac('sha256', ENV_COMPARE_KEY).update(value).digest();
        const emailOk = crypto.timingSafeEqual(digest(input.data.email), digest(expectedEmail));
        const passwordOk = crypto.timingSafeEqual(digest(input.data.password), digest(expectedPassword));
        if (!emailOk || !passwordOk) return null;
        return { id: 'platform-owner', name: 'Platform Owner', email: input.data.email };
      },
    }),
    // Mirrors an existing commerce login (admin/agent/supplier/customer via
    // tsk_session) into an Auth.js session carrying the role. It takes no
    // user input: the role comes only from the server-validated session cookie.
    Credentials({
      id: 'tsk-session',
      name: 'THAISERKIT session',
      credentials: {},
      async authorize(_raw, request) {
        const identity = await legacyIdentity(request);
        if (!identity) return null;
        return {
          id: identity.id,
          name: identity.name,
          email: identity.email || null,
          role: identity.role,
        } as { id: string; name: string; email: string | null };
      },
    }),
  );
  return providers;
}

function assertSecret() {
  if (process.env.NODE_ENV === 'production' && env('AUTH_SECRET').length < 32) {
    // Fail closed, not open: without a real secret every session JWT (and the
    // kit-quote HMAC fallback) is forgeable. This module executes on every
    // auth-involved route, so a missing secret refuses to boot the auth plane
    // instead of running it insecurely. Dev/test are unaffected, and the
    // production BUILD is exempt (Next evaluates route modules while
    // collecting page data — enforcement happens at runtime under next start).
    // (src/env.ts carries the same rule for future wiring; this one executes.)
    // NEXT_PHASE is set by Next.js itself during `next build` only.
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      throw new Error('[auth] AUTH_SECRET must be set to at least 32 characters in production');
    }
  }
}

const ROLE_BY_PROVIDER: Record<string, AuthRole> = {
  'platform-credentials': 'owner',
  google: 'customer',
  facebook: 'customer',
  line: 'customer',
};

// Lazy config: built per request so runtime secrets and the request itself
// (for the role re-check) are available. `request` is undefined in RSC calls.
export const { handlers, auth, signIn, signOut } = NextAuth((request): NextAuthConfig => {
  assertSecret();
  return {
    secret: env('AUTH_SECRET') || undefined,
    trustHost: true,
    providers: buildProviders(),
    session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
    pages: { signIn: '/login' },
    callbacks: {
      async jwt({ token, account, profile, user }) {
        if (account?.provider) {
          token.authProvider = account.provider;
          token.providerAccountId = account.providerAccountId;
          const raw = (profile || {}) as Record<string, unknown>;
          token.authEmailVerified =
            raw.email_verified === true ||
            raw.email_verified === 'true' ||
            raw.verified === true ||
            raw.verified === 'true';
          const signedInRole = (user as { role?: AuthRole } | undefined)?.role;
          token.role = signedInRole || ROLE_BY_PROVIDER[account.provider];
          token.roleCheckedAt = Date.now();
          return token;
        }
        // Keep the role in step with the commerce session behind this browser.
        const mirrorsCommerceSession = token.authProvider === 'tsk-session';
        if (
          request &&
          mirrorsCommerceSession &&
          Date.now() - Number(token.roleCheckedAt || 0) > ROLE_RECHECK_MS
        ) {
          const identity = await legacyIdentity(request);
          if (!identity) return null;
          token.role = identity.role;
          token.roleCheckedAt = Date.now();
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user && token.sub) session.user.id = token.sub;
        if (session.user) {
          session.user.authProvider = typeof token.authProvider === 'string' ? token.authProvider : '';
          session.user.providerAccountId =
            typeof token.providerAccountId === 'string' ? token.providerAccountId : '';
          session.user.authEmailVerified = token.authEmailVerified === true;
          session.user.role = token.role as AuthRole | undefined;
        }
        return session;
      },
    },
  };
});

/** The Auth.js role of the current request, or null when not signed in through Auth.js. */
export async function authRole(): Promise<AuthRole | null> {
  const session = await auth();
  return session?.user?.role ?? null;
}
