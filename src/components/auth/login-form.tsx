'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { LockKeyhole, Mail, ShieldCheck, Store, UserPlus, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getProviders, signIn } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Turnstile } from '@/components/forms/turnstile';
import { Button } from '@/components/ui/button';
import { Field, PasswordInput } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';

export type AuthTab = 'customer' | 'register' | 'admin' | 'agent' | 'supplier';

type LoginFormProps = {
  compact?: boolean;
  initialTab?: AuthTab;
  redirectTo?: string;
  onSuccess?: () => void;
};

const loginSchema = z.object({
  identifier: z.string().min(1, 'กรุณากรอกบัญชี'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
});
type LoginValue = z.infer<typeof loginSchema>;
const registerSchema = z.object({
  name: z.string().trim().min(2, 'กรุณากรอกชื่อ-นามสกุล'),
  email: z.string().trim().email('รูปแบบอีเมลไม่ถูกต้อง'),
  phone: z.string().trim().min(9, 'เบอร์โทรต้องมีอย่างน้อย 9 หลัก'),
  password: z.string().min(10, 'รหัสผ่านอย่างน้อย 10 ตัวอักษร'),
});
type RegisterValue = z.infer<typeof registerSchema>;

const tabs: Array<{ key: AuthTab; label: string; icon: typeof UserRound }> = [
  { key: 'customer', label: 'ลูกค้า', icon: UserRound },
  { key: 'register', label: 'สมัครสมาชิก', icon: UserPlus },
  { key: 'admin', label: 'แอดมิน', icon: ShieldCheck },
  { key: 'agent', label: 'ตัวแทน', icon: Store },
  { key: 'supplier', label: 'Supplier', icon: Store },
];

const HOME_FOR: Record<AuthTab, string> = {
  customer: '/account',
  register: '/account',
  admin: '/admin',
  agent: '/agent',
  supplier: '/supplier',
};

function safeRedirect(value: string, fallback: string) {
  const target = value.trim();
  return target.startsWith('/') && !target.startsWith('//') ? target : fallback;
}

function authError(error: unknown) {
  const api = error instanceof LegacyApiError ? error : null;
  const code = api?.code || '';
  const body = (api?.detail && typeof api.detail === 'object' ? api.detail : {}) as Record<string, unknown>;
  const field = String(body.field || '');
  if (code === 'invalid_input') {
    if (field === 'name') return 'กรุณากรอกชื่อ-นามสกุล';
    if (field === 'email') return 'รูปแบบอีเมลไม่ถูกต้อง เช่น name@example.com';
    if (field === 'phone') return 'เบอร์โทรไม่ถูกต้อง ต้องมีอย่างน้อย 9 หลัก';
    if (field === 'password') return 'รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร';
    return 'กรอกข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง';
  }
  if (code === 'email_or_phone_exists')
    return field === 'email'
      ? 'อีเมลนี้เคยสมัครไว้แล้ว ลองเข้าสู่ระบบแทน'
      : field === 'phone'
        ? 'เบอร์โทรนี้เคยสมัครไว้แล้ว ลองเข้าสู่ระบบแทน'
        : 'อีเมลหรือเบอร์โทรนี้เคยสมัครไว้แล้ว ลองเข้าสู่ระบบแทน';
  const map: Record<string, string> = {
    invalid_credentials: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    admin_not_configured: 'ยังไม่ได้ตั้งค่าบัญชีผู้ดูแลระบบบนเซิร์ฟเวอร์',
    admin_password_too_weak: 'รหัสผ่านผู้ดูแลระบบบนเซิร์ฟเวอร์สั้นเกินไป',
    rate_limited: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่',
    session_store_unavailable: 'ระบบเซสชันไม่พร้อมใช้งานชั่วคราว',
    account_suspended: 'บัญชีนี้ถูกระงับ กรุณาติดต่อทีมงาน',
    pending_approval: 'บัญชีนี้ยังรอการอนุมัติจากผู้ดูแลระบบ',
    weak_password: 'รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร',
    turnstile_required: 'กรุณายืนยันว่าคุณไม่ใช่บอท',
    turnstile_failed: 'การตรวจสอบความปลอดภัยไม่สำเร็จ กรุณาลองใหม่',
    turnstile_unavailable: 'ระบบตรวจสอบความปลอดภัยไม่พร้อมใช้งานชั่วคราว',
  };
  return map[code] || (code ? `ดำเนินการไม่สำเร็จ (${code})` : 'เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่');
}

export function LoginForm({ compact = false, initialTab, redirectTo = '', onSuccess }: LoginFormProps = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requested = searchParams.get('role') || searchParams.get('next') || 'customer';
  const inferred: AuthTab =
    requested === 'owner'
      ? 'admin'
      : tabs.some((item) => item.key === requested)
        ? (requested as AuthTab)
        : 'customer';
  const [tab, setTab] = useState<AuthTab>(initialTab || inferred);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [rateSeconds, setRateSeconds] = useState(0);
  const [socialProviders, setSocialProviders] = useState<Array<'google' | 'facebook' | 'line'>>([]);
  const [socialBusy, setSocialBusy] = useState<string>('');

  const login = useForm<LoginValue>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });
  const register = useForm<RegisterValue>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', phone: '', password: '' },
  });

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);
  useEffect(() => {
    let alive = true;
    void getProviders()
      .then((providers) => {
        if (!alive) return;
        const enabled = (['google', 'facebook', 'line'] as const).filter((provider) =>
          Boolean(providers?.[provider]),
        );
        setSocialProviders([...enabled]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const code = searchParams.get('oauth_error');
    if (!code) return;
    const errors: Record<string, string> = {
      oauth_session_missing: 'เซสชันเข้าสู่ระบบด้วย Social หมดอายุ กรุณาลองใหม่',
      oauth_identity_invalid: 'ผู้ให้บริการส่งข้อมูลบัญชีมาไม่ครบ กรุณาลองใหม่',
      oauth_email_required: 'บัญชี Social นี้ไม่มีอีเมล กรุณาอนุญาตอีเมลหรือใช้การเข้าสู่ระบบปกติ',
      oauth_account_exists: 'อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านก่อน แล้วเชื่อมบัญชี Social ในหน้าความปลอดภัย',
      oauth_bridge_unavailable: 'ระบบเชื่อมบัญชี Social ไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่',
      rate_limited: 'เข้าสู่ระบบด้วย Social บ่อยเกินไป กรุณารอสักครู่',
    };
    setMessage(errors[code] || 'เข้าสู่ระบบด้วย Social ไม่สำเร็จ กรุณาลองใหม่');
  }, [searchParams]);
  useEffect(() => {
    if (rateSeconds <= 0) return;
    const timer = window.setInterval(() => setRateSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [rateSeconds]);

  const countdown = useMemo(
    () => `${Math.floor(rateSeconds / 60)}:${String(rateSeconds % 60).padStart(2, '0')}`,
    [rateSeconds],
  );
  const queryRedirect = searchParams.get('redirect') || (requested === 'owner' ? '/owner' : '');
  const redirect = safeRedirect(redirectTo || queryRedirect || HOME_FOR[tab], HOME_FOR[tab]);

  function choose(next: AuthTab) {
    setTab(next);
    setMessage('');
    setSuccess('');
    setRateSeconds(0);
  }

  function finish() {
    onSuccess?.();
    router.replace(redirect);
    router.refresh();
  }

  async function startSocial(provider: 'google' | 'facebook' | 'line') {
    setMessage('');
    setSuccess('');
    setSocialBusy(provider);
    try {
      const bridge = `/api/auth/legacy-bridge?redirect=${encodeURIComponent(redirect)}`;
      await signIn(provider, { redirectTo: bridge });
    } catch {
      setMessage('ไม่สามารถเริ่มการเข้าสู่ระบบด้วย Social ได้ กรุณาลองใหม่');
      setSocialBusy('');
    }
  }

  async function submitLogin(values: LoginValue) {
    setMessage('');
    setSuccess('');
    try {
      if (tab === 'admin')
        await legacyRequest(
          'admin.login',
          { username: values.identifier, password: values.password },
          'POST',
        );
      else if (tab === 'agent')
        await legacyRequest('agent.login', { email: values.identifier, password: values.password }, 'POST');
      else if (tab === 'supplier')
        await legacyRequest(
          'supplier.login',
          { email: values.identifier, password: values.password },
          'POST',
        );
      else
        await legacyRequest(
          'customer.login',
          { identifier: values.identifier, password: values.password },
          'POST',
        );
      finish();
    } catch (error) {
      if (error instanceof LegacyApiError && error.code === 'rate_limited') {
        const body =
          error.detail && typeof error.detail === 'object' ? (error.detail as Record<string, unknown>) : {};
        setRateSeconds(Math.max(1, Number(body.retry_after || 900)));
      }
      setMessage(authError(error));
    }
  }

  async function submitRegister(values: RegisterValue) {
    setMessage('');
    setSuccess('');
    try {
      await legacyRequest(
        'customer.register',
        { ...values, 'cf-turnstile-response': turnstileToken },
        'POST',
      );
      setSuccess('สมัครสมาชิกสำเร็จ กำลังเข้าสู่บัญชีของคุณ');
      finish();
    } catch (error) {
      setMessage(authError(error));
      setTurnstileToken('');
    }
  }

  const content = (
    <div
      className={
        compact
          ? 'w-full'
          : 'mx-auto w-full max-w-lg rounded-3xl border bg-white p-5 shadow-xl shadow-emerald-950/5 sm:p-8'
      }
    >
      {!compact ? (
        <>
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-950 text-white">
            <LockKeyhole size={26} />
          </div>
          <h1 className="mt-5 text-center text-2xl font-black">ยินดีต้อนรับกลับมา</h1>
          <p className="mt-1 text-center text-sm text-slate-500">
            เข้าสู่ระบบเพื่อสั่งซื้อ ติดตามออเดอร์ และใช้รายการโปรดข้ามอุปกรณ์
          </p>
        </>
      ) : null}

      <div className={`${compact ? '' : 'mt-6'} rounded-2xl bg-slate-100 p-1`}>
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-5" role="tablist">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => choose(key)}
              className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-2.5 text-xs font-bold transition ${tab === key ? 'bg-white text-emerald-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {(tab === 'customer' || tab === 'register') && socialProviders.length > 0 && (
        <div className="mt-5 space-y-2">
          {socialProviders.map((provider) => (
            <button
              key={provider}
              type="button"
              disabled={Boolean(socialBusy)}
              onClick={() => void startSocial(provider)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
            >
              <SocialMark provider={provider} />
              {socialBusy === provider
                ? 'กำลังเชื่อมต่อ…'
                : `ดำเนินการต่อด้วย ${provider === 'google' ? 'Google' : provider === 'facebook' ? 'Facebook' : 'LINE'}`}
            </button>
          ))}
          <div className="flex items-center gap-3 py-1 text-[11px] font-bold uppercase tracking-[.15em] text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            <span>หรือ</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </div>
      )}

      {tab === 'register' ? (
        <form onSubmit={register.handleSubmit(submitRegister)} className="mt-6 space-y-4" noValidate>
          <Field label="ชื่อ-นามสกุล" required error={register.formState.errors.name?.message}>
            <Input
              autoComplete="name"
              aria-invalid={Boolean(register.formState.errors.name)}
              {...register.register('name')}
            />
          </Field>
          <Field label="อีเมล" required error={register.formState.errors.email?.message}>
            <div className="relative">
              <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
              <Input
                type="email"
                autoComplete="email"
                className="pl-10"
                aria-invalid={Boolean(register.formState.errors.email)}
                {...register.register('email')}
              />
            </div>
          </Field>
          <Field label="เบอร์โทรศัพท์" required error={register.formState.errors.phone?.message}>
            <Input
              inputMode="tel"
              autoComplete="tel"
              aria-invalid={Boolean(register.formState.errors.phone)}
              {...register.register('phone')}
            />
          </Field>
          <Field
            label="รหัสผ่าน"
            required
            error={register.formState.errors.password?.message}
            hint="อย่างน้อย 10 ตัวอักษร"
          >
            <PasswordInput
              minLength={10}
              autoComplete="new-password"
              aria-invalid={Boolean(register.formState.errors.password)}
              {...register.register('password')}
            />
          </Field>
          <Turnstile action="register" onToken={setTurnstileToken} />
          {message && (
            <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">
              {message}
            </p>
          )}
          {success && (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{success}</p>
          )}
          <Button className="w-full" size="lg" disabled={register.formState.isSubmitting}>
            {register.formState.isSubmitting ? 'กำลังสมัคร…' : 'สมัครสมาชิก'}
          </Button>
          <p className="text-center text-xs text-slate-500">
            มีบัญชีอยู่แล้ว?{' '}
            <button
              type="button"
              className="font-bold text-emerald-800 underline"
              onClick={() => choose('customer')}
            >
              เข้าสู่ระบบ
            </button>
          </p>
        </form>
      ) : (
        <form onSubmit={login.handleSubmit(submitLogin)} className="mt-6 space-y-4" noValidate>
          <Field
            label={tab === 'admin' ? 'ชื่อผู้ใช้แอดมิน' : 'อีเมล หรือ เบอร์โทรศัพท์'}
            required
            error={login.formState.errors.identifier?.message}
          >
            <div className="relative">
              {tab === 'admin' ? (
                <UserRound className="absolute left-3 top-3 text-slate-400" size={18} />
              ) : (
                <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
              )}
              <Input
                autoComplete="username"
                className="pl-10"
                aria-invalid={Boolean(login.formState.errors.identifier)}
                {...login.register('identifier')}
              />
            </div>
          </Field>
          <Field label="รหัสผ่าน" required error={login.formState.errors.password?.message}>
            <PasswordInput
              autoComplete="current-password"
              aria-invalid={Boolean(login.formState.errors.password)}
              {...login.register('password')}
            />
          </Field>
          {message && (
            <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">
              {message}
              {rateSeconds > 0 ? ` — ลองใหม่ใน ${countdown}` : ''}
            </p>
          )}
          {tab === 'customer' && (
            <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
              <span>
                ยังไม่มีบัญชี?{' '}
                <button
                  type="button"
                  className="font-bold text-emerald-800 underline"
                  onClick={() => choose('register')}
                >
                  สมัครสมาชิก
                </button>
              </span>
              <Link href="/contact" className="font-semibold text-emerald-800" onClick={onSuccess}>
                ลืมรหัสผ่าน?
              </Link>
            </div>
          )}
          <Button className="w-full" size="lg" disabled={login.formState.isSubmitting || rateSeconds > 0}>
            {login.formState.isSubmitting
              ? 'กำลังตรวจสอบ…'
              : rateSeconds > 0
                ? `ลองใหม่ใน ${countdown}`
                : 'เข้าสู่ระบบ'}
          </Button>
        </form>
      )}
    </div>
  );

  if (compact) return content;
  return (
    <div className="surface-grid min-h-[72vh] px-4 py-10 sm:py-14">
      {content}
      <p className="mx-auto mt-5 max-w-lg text-center text-sm text-slate-500">
        ยังไม่เคยสั่งซื้อกับเรา?{' '}
        <Link href="/products" className="font-bold text-emerald-800 hover:underline">
          เลือกดูสินค้าก่อนได้เลย
        </Link>
      </p>
    </div>
  );
}

function SocialMark({ provider }: { provider: 'google' | 'facebook' | 'line' }) {
  if (provider === 'google')
    return (
      <svg viewBox="0 0 18 18" aria-hidden="true" className="size-4">
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.94v2.33A9 9 0 0 0 9 18Z"
        />
        <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.94a9 9 0 0 0 0 8.1l3.03-2.33Z" />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .94 4.95l3.03 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
        />
      </svg>
    );
  if (provider === 'facebook')
    return (
      <span
        aria-hidden="true"
        className="grid size-5 place-items-center rounded-full bg-[#1877F2] text-xs font-black text-white"
      >
        f
      </span>
    );
  return (
    <span
      aria-hidden="true"
      className="grid size-5 place-items-center rounded-full bg-[#06C755] text-[9px] font-black text-white"
    >
      LINE
    </span>
  );
}
