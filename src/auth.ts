import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Facebook from 'next-auth/providers/facebook';
import Google from 'next-auth/providers/google';
import type { Provider } from 'next-auth/providers';
import { z } from 'zod';

const providers: Provider[] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET }));
}
if (process.env.AUTH_FACEBOOK_ID && process.env.AUTH_FACEBOOK_SECRET) {
  providers.push(Facebook({ clientId: process.env.AUTH_FACEBOOK_ID, clientSecret: process.env.AUTH_FACEBOOK_SECRET }));
}
if (process.env.AUTH_LINE_ID && process.env.AUTH_LINE_SECRET) {
  providers.push({
    id: 'line',
    name: 'LINE',
    type: 'oidc',
    issuer: 'https://access.line.me',
    clientId: process.env.AUTH_LINE_ID,
    clientSecret: process.env.AUTH_LINE_SECRET,
    authorization: { url: 'https://access.line.me/oauth2/v2.1/authorize', params: { scope: 'openid profile email' } },
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

providers.push(Credentials({
  id: 'platform-credentials',
  name: 'Platform Credentials',
  credentials: { email: { label: 'Email', type: 'email' }, password: { label: 'Password', type: 'password' } },
  authorize(raw) {
    const input = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(raw);
    if (!input.success) return null;
    if (!process.env.AUTH_PLATFORM_EMAIL || !process.env.AUTH_PLATFORM_PASSWORD) return null;
    if (input.data.email !== process.env.AUTH_PLATFORM_EMAIL || input.data.password !== process.env.AUTH_PLATFORM_PASSWORD) return null;
    return { id: 'platform-owner', name: 'Platform Owner', email: input.data.email };
  },
}));

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
        token.authEmailVerified = raw.email_verified === true || raw.email_verified === 'true'
          || raw.verified === true || raw.verified === 'true';
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      if (session.user) {
        session.user.authProvider = typeof token.authProvider === 'string' ? token.authProvider : '';
        session.user.providerAccountId = typeof token.providerAccountId === 'string' ? token.providerAccountId : '';
        session.user.authEmailVerified = token.authEmailVerified === true;
      }
      return session;
    },
  },
});
