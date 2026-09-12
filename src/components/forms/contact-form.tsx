'use client';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FormNotice, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';
import { Turnstile } from './turnstile';

export function ContactForm() {
  const [form, setForm] = useState({ name: '', contact_phone: '', email: '', message: '' });
  const [token, setToken] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await legacyRequest('contact.create', { ...form, 'cf-turnstile-response': token }, 'POST');
      setNotice({ tone: 'ok', text: 'ส่งข้อความเรียบร้อย ทีมงานจะติดต่อกลับโดยเร็ว' });
      setForm({ name: '', contact_phone: '', email: '', message: '' });
      setToken('');
    } catch (x) {
      setNotice({ tone: 'bad', text: `ส่งไม่สำเร็จ: ${x instanceof LegacyApiError ? x.code : 'unknown'}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-bold">ส่งข้อความถึงเรา</h2>
      <p className="mt-1 text-sm text-slate-500">กรอกข้อมูลด้านล่าง ทีมงานจะติดต่อกลับโดยเร็วที่สุด</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="ชื่อ-นามสกุล" required>
          <Input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="เช่น สมชาย ใจดี"
            autoComplete="name"
          />
        </Field>
        <Field label="เบอร์โทร" required>
          <Input
            required
            value={form.contact_phone}
            onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            placeholder="เช่น 0812345678"
            inputMode="tel"
            autoComplete="tel"
          />
        </Field>
        <Field label="อีเมล (ถ้ามี)" className="sm:col-span-2">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="name@example.com"
            autoComplete="email"
          />
        </Field>
        <Field label="ข้อความ" required className="sm:col-span-2">
          <Textarea
            required
            rows={6}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="เล่ารายละเอียดสินค้าหรือปัญหาที่ต้องการสอบถาม"
          />
        </Field>
        <div className="sm:col-span-2">
          <Turnstile action="contact" onToken={setToken} />
        </div>
      </div>
      {notice && (
        <FormNotice tone={notice.tone} className="mt-4">
          {notice.text}
        </FormNotice>
      )}
      <Button disabled={busy} className="mt-5 w-full sm:w-auto" size="lg">
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            กำลังส่ง…
          </>
        ) : (
          'ส่งข้อความ'
        )}
      </Button>
    </form>
  );
}
