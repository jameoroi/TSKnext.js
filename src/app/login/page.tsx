import type { Metadata } from 'next';
import { LoginForm, type SocialProvider } from '@/components/auth/login-form';
export const metadata: Metadata = { title: 'เข้าสู่ระบบ', robots: { index: false, follow: false } };
export default function LoginPage() {
  const socialProviders = [
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? 'google' : null,
    process.env.AUTH_FACEBOOK_ID && process.env.AUTH_FACEBOOK_SECRET ? 'facebook' : null,
    process.env.AUTH_LINE_ID && process.env.AUTH_LINE_SECRET ? 'line' : null,
  ].filter(Boolean) as SocialProvider[];
  return <LoginForm socialProviders={socialProviders} />;
}
