'use client';
import { BadgeCheck, Loader2, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FormNotice, PasswordInput, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';
import { Turnstile } from './turnstile';

type Form = {
  first_name: string;
  last_name: string;
  birth_date: string;
  phone: string;
  email: string;
  password: string;
  store_name: string;
  address: string;
  province: string;
  postal_code: string;
  facebook: string;
  line_id: string;
  tiktok: string;
  sponsor_code: string;
  bank_name: string;
  bank_account_name: string;
  bank_account_no: string;
  note: string;
};

const EMPTY: Form = {
  first_name: '',
  last_name: '',
  birth_date: '',
  phone: '',
  email: '',
  password: '',
  store_name: '',
  address: '',
  province: '',
  postal_code: '',
  facebook: '',
  line_id: '',
  tiktok: '',
  sponsor_code: '',
  bank_name: '',
  bank_account_name: '',
  bank_account_no: '',
  note: '',
};

function partnerError(error: unknown) {
  const code = error instanceof LegacyApiError ? error.code : '';
  const messages: Record<string, string> = {
    invalid_partner_application: 'กรุณากรอกข้อมูลให้ครบ ตั้งรหัสผ่านอย่างน้อย 10 ตัวอักษร และยอมรับเงื่อนไข',
    application_exists: 'อีเมลหรือเบอร์โทรนี้มีใบสมัครอยู่แล้ว กรุณารอการตรวจสอบหรือใช้ข้อมูลอื่น',
    invalid_sponsor_code: 'รหัสผู้แนะนำไม่ถูกต้อง กรุณาตรวจสอบอีกครั้งหรือเว้นว่างไว้',
    rate_limited: 'ส่งใบสมัครบ่อยเกินไป กรุณาลองใหม่ภายหลัง',
  };
  return messages[code] || `ส่งใบสมัครไม่สำเร็จ${code ? ` (${code})` : ' กรุณาตรวจข้อมูลแล้วลองใหม่'}`;
}

export function PartnerForm() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [token, setToken] = useState('');
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<{ application_id?: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const prefillApplied = useRef(false);

  // รับข้อมูลต่อจากฟอร์มย่อบนหน้าแรก (DealerRegisterSection ส่งมาเป็น query params)
  // อ่านจาก window ใน effect ฝั่ง client เท่านั้น เพื่อไม่กระทบ static prerender
  useEffect(() => {
    if (prefillApplied.current) return;
    prefillApplied.current = true;
    try {
      const params = new URLSearchParams(window.location.search);
      const fullName = (params.get('full_name') || '').trim();
      const shopName = (params.get('shop_name') || '').trim();
      const phone = (params.get('phone') || '').trim();
      const email = (params.get('email') || '').trim();
      const province = (params.get('province') || '').trim();
      const message = (params.get('message') || '').trim();
      if (!fullName && !shopName && !phone && !email && !province && !message) return;
      const parts = fullName.split(/\s+/).filter(Boolean);
      setForm((f) => ({
        ...f,
        first_name: f.first_name || parts[0] || '',
        last_name: f.last_name || parts.slice(1).join(' ') || '',
        store_name: f.store_name || shopName,
        phone: f.phone || phone,
        email: f.email || email,
        province: f.province || province,
        note: f.note || message,
      }));
    } catch {}
  }, []);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !consent) return;
    setBusy(true);
    setError('');
    try {
      const d = await legacyRequest<{ application_id?: unknown; application_no?: unknown }>(
        'partner.apply',
        { ...form, terms_accepted: true, 'cf-turnstile-response': token },
        'POST',
      );
      setResult({ application_id: String(d.application_id || d.application_no || '') });
    } catch (x) {
      setError(partnerError(x));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center sm:p-10">
        <BadgeCheck className="mx-auto text-emerald-600" size={56} />
        <h2 className="mt-4 text-2xl font-black text-emerald-950">ส่งใบสมัครสำเร็จ</h2>
        <p className="mt-2 text-sm text-emerald-900">สถานะ: รอ Super Admin ตรวจสอบและอนุมัติ</p>
        {result.application_id ? (
          <p className="mt-2 text-sm text-emerald-900">
            เลขที่ใบสมัคร:{' '}
            <code className="rounded bg-white px-2 py-0.5 font-mono">{result.application_id}</code>
          </p>
        ) : null}
        <p className="mt-2 text-sm text-emerald-900">เมื่อได้รับอนุมัติ ให้เข้า Agent Center ด้วยอีเมลและรหัสผ่านที่ตั้งไว้นี้</p>
        <Link
          href="/login?role=agent"
          className="mt-6 inline-flex h-13 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-emerald-900 px-7 text-base font-semibold text-white transition hover:bg-emerald-800"
        >
          ไปหน้าเข้าสู่ระบบตัวแทน
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate={false}>
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white">
          <BadgeCheck className="size-3.5" /> Official Store
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
          <ShieldCheck className="size-3.5" /> Authorized Partner
        </span>
      </div>

      <fieldset className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
        <legend className="px-2 text-xl font-bold">ข้อมูลผู้สมัคร</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อจริง" required>
            <Input
              required
              value={form.first_name}
              onChange={set('first_name')}
              autoComplete="given-name"
              placeholder="เช่น สมชาย"
            />
          </Field>
          <Field label="นามสกุล" required>
            <Input
              required
              value={form.last_name}
              onChange={set('last_name')}
              autoComplete="family-name"
              placeholder="เช่น ใจดี"
            />
          </Field>
          <Field label="วันเกิด" hint="ไม่บังคับ">
            <Input type="date" value={form.birth_date} onChange={set('birth_date')} autoComplete="bday" />
          </Field>
          <Field label="เบอร์โทร" required>
            <Input
              required
              value={form.phone}
              onChange={set('phone')}
              inputMode="tel"
              autoComplete="tel"
              placeholder="เช่น 0812345678"
            />
          </Field>
          <Field label="อีเมล" required className="sm:col-span-2">
            <Input
              required
              type="email"
              value={form.email}
              onChange={set('email')}
              autoComplete="email"
              placeholder="name@example.com"
            />
          </Field>
          <Field
            label="รหัสผ่านของคุณ"
            required
            hint="ตั้งเองตั้งแต่สมัคร อย่างน้อย 10 ตัวอักษร"
            className="sm:col-span-2"
          >
            <PasswordInput
              required
              minLength={10}
              value={form.password}
              onChange={set('password')}
              autoComplete="new-password"
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
        <legend className="px-2 text-xl font-bold">ข้อมูลร้านตัวแทน</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อร้านตัวแทน" required hint="ชื่อที่ต้องการแสดงแก่ลูกค้า" className="sm:col-span-2">
            <Input
              required
              value={form.store_name}
              onChange={set('store_name')}
              placeholder="เช่น ร้านสมชายการเกษตร"
            />
          </Field>
          <Field label="ที่อยู่ร้าน" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={form.address}
              onChange={set('address')}
              placeholder="บ้านเลขที่ หมู่ ตำบล อำเภอ"
            />
          </Field>
          <Field label="จังหวัด">
            <Input value={form.province} onChange={set('province')} autoComplete="address-level1" />
          </Field>
          <Field label="รหัสไปรษณีย์">
            <Input
              value={form.postal_code}
              onChange={set('postal_code')}
              inputMode="numeric"
              autoComplete="postal-code"
            />
          </Field>
          <Field label="Facebook">
            <Input value={form.facebook} onChange={set('facebook')} placeholder="ลิงก์เพจร้าน" />
          </Field>
          <Field label="LINE ID">
            <Input value={form.line_id} onChange={set('line_id')} placeholder="ไอดีไลน์ร้าน" />
          </Field>
          <Field label="TikTok / ช่องทางขายอื่น" className="sm:col-span-2">
            <Input value={form.tiktok} onChange={set('tiktok')} placeholder="เช่น @my_shop" />
          </Field>
          <Field label="รหัสผู้แนะนำ" hint="ถ้ามี — ไม่บังคับ" className="sm:col-span-2">
            <Input
              value={form.sponsor_code}
              onChange={set('sponsor_code')}
              autoComplete="off"
              placeholder="เช่น TSK-ABC123"
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
        <legend className="px-2 text-xl font-bold">บัญชีสำหรับรับค่าคอมมิชชัน</legend>
        <p className="text-sm text-slate-500">ข้อมูลส่วนนี้ใช้ภายในบริษัทและไม่แสดงบนหน้าสินค้า</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="ธนาคาร">
            <Input value={form.bank_name} onChange={set('bank_name')} placeholder="เช่น กสิกรไทย" />
          </Field>
          <Field label="ชื่อบัญชี">
            <Input
              value={form.bank_account_name}
              onChange={set('bank_account_name')}
              placeholder="ชื่อเจ้าของบัญชี"
            />
          </Field>
          <Field label="เลขบัญชี" className="sm:col-span-2">
            <Input
              value={form.bank_account_no}
              onChange={set('bank_account_no')}
              inputMode="numeric"
              placeholder="เลขบัญชี 10 หลัก"
            />
          </Field>
          <Field label="ข้อมูลเพิ่มเติม" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={form.note}
              onChange={set('note')}
              placeholder="เล่าเกี่ยวกับร้านหรือช่องทางขายของคุณ"
            />
          </Field>
        </div>
      </fieldset>

      <div className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
            className="mt-1 size-4 shrink-0 accent-emerald-800"
          />
          <span>
            ข้าพเจ้ายืนยันว่าข้อมูลเป็นความจริง และเข้าใจว่าการสมัครยังไม่ถือว่าเป็นตัวแทนจนกว่าบริษัทจะอนุมัติ ตาม
            <Link className="font-semibold text-emerald-800 tsk-link" href="/privacy">
              นโยบายความเป็นส่วนตัว
            </Link>
          </span>
        </label>
        {error && (
          <FormNotice tone="bad" className="mt-4">
            {error}
          </FormNotice>
        )}
        <div className="mt-4">
          <Turnstile action="partner" onToken={setToken} />
        </div>
        <Button disabled={busy || !consent} className="mt-4 w-full sm:w-auto" size="lg">
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              กำลังส่งใบสมัคร…
            </>
          ) : (
            'ส่งใบสมัครตัวแทน'
          )}
        </Button>
      </div>
    </form>
  );
}
