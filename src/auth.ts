import crypto from 'node:crypto';
import NextAuth from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Credentials from 'next-auth/providers/credentials';
import Facebook from 'next-auth/providers/facebook';
import Google from 'next-auth/providers/google';
import { z } from 'zod';

const ENV_COMPARE_KEY = crypto.randomBytes(32);

const providers: Provider[] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET }),
  );
}
if (process.env.AUTH_FACEBOOK_ID && process.env.AUTH_FACEBOOK_SECRET) {
  providers.push(
    Facebook({ clientId: process.env.AUTH_FACEBOOK_ID, clientSecret: process.env.AUTH_FACEBOOK_SECRET }),
  );
}
if (process.env.AUTH_LINE_ID && process.env.AUTH_LINE_SECRET) {
  providers.push({
    id: 'line',
    name: 'LINE',
    type: 'oidc',
    issuer: 'https://access.line.me',
    clientId: process.env.AUTH_LINE_ID,
    clientSecret: process.env.AUTH_LINE_SECRET,
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
      const expectedEmail = process.env.AUTH_PLATFORM_EMAIL || '';
      const expectedPassword = process.env.AUTH_PLATFORM_PASSWORD || '';
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
);

if (process.env.NODE_ENV === 'production' && String(process.env.AUTH_SECRET || '').length < 32) {
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  providers,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider) {
        token.authProvider = account.provider;
        token.providerAccountId = account.providerAccountId;
        const raw = (profile || {}) as Record<string, unknown>;
        token.authEmailVerified =
          raw.email_verified === true ||
          raw.email_verified === 'true' ||
          raw.verified === true ||
          raw.verified === 'true';
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
      }
      return session;
    },
  },
});
