'use client';

import { Send } from 'lucide-react';
import { useState } from 'react';
import { Turnstile } from '@/components/forms/turnstile';
import { Button } from '@/components/ui/button';
import { Field, FormNotice, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';

const POINTS = ['ให้คำปรึกษาโดยผู้เชี่ยวชาญ', 'ราคาพิเศษสำหรับองค์กร', 'ตอบกลับรวดเร็ว'];

/**
 * การ์ดขอใบเสนอราคา + ฟอร์มย่อ (ส่งเข้า contact.create เหมือนฟอร์มติดต่อ)
 * Turnstile แสดงเฉพาะเมื่อตั้ง site key ไว้ — ไม่ตั้งก็ส่งได้ (backend fail-open)
 */
export function QuoteSection() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!name.trim() || !phone.trim() || !message.trim()) {
      setNotice({ tone: 'bad', text: 'กรุณากรอกชื่อ เบอร์โทร และข้อความให้ครบ' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await legacyRequest(
        'contact.create',
        {
          name: name.trim(),
          contact_phone: phone.trim(),
          email: email.trim(),
          message: message.trim(),
          'cf-turnstile-response': token,
        },
        'POST',
      );
      setNotice({ tone: 'ok', text: 'ส่งข้อความเรียบร้อย ทีมงานจะติดต่อกลับโดยเร็ว' });
      setName('');
      setPhone('');
      setEmail('');
      setMessage('');
      setToken('');
    } catch (cause) {
      setNotice({
        tone: 'bad',
        text: `ส่งไม่สำเร็จ: ${cause instanceof LegacyApiError ? cause.code : 'unknown'}`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-7xl px-4 pb-12 lg:px-6" aria-label="สอบถามหรือขอใบเสนอราคา">
      <div className="grid gap-6 rounded-3xl bg-emerald-950 p-6 text-white sm:p-8 lg:grid-cols-2">
        <div>
          <p className="text-xs font-black uppercase tracking-[.2em] text-emerald-300">THAISERKIT SUPPLY</p>
          <h2 className="mt-2 text-2xl font-black leading-snug sm:text-3xl">
            สอบถามหรือขอใบเสนอราคา
            <br />
            เราพร้อมดูแลคุณ
          </h2>
          <ul className="mt-5 grid gap-2.5">
            {POINTS.map((point) => (
              <li key={point} className="flex items-center gap-2.5 text-sm font-semibold text-emerald-50">
                <span
                  aria-hidden="true"
                  className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-700 text-xs"
                >
                  ✓
                </span>
                {point}
              </li>
            ))}
          </ul>
          <p className="mt-6 border-l-2 border-amber-400 pl-4 text-sm italic leading-7 text-emerald-100/80">
            “เครื่องมือที่ดี สร้างงานที่ดีกว่า”
          </p>
        </div>
        <form onSubmit={submit} className="rounded-2xl bg-white p-5 text-slate-900 sm:p-6" noValidate={false}>
          <h3 className="font-bold">ส่งข้อมูลหาเรา</h3>
          <p className="mt-1 text-xs text-slate-500">กรอกข้อมูลด้านล่าง ทีมงานจะติดต่อกลับโดยเร็วที่สุด</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="ชื่อ-นามสกุล" required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="เช่น สมชาย ใจดี"
              />
            </Field>
            <Field label="เบอร์โทร" required>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                autoComplete="tel"
                placeholder="เช่น 0812345678"
              />
            </Field>
            <Field label="อีเมล">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="name@example.com"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="ข้อความ" required>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="เล่ารายละเอียดที่ต้องการสอบถาม"
                />
              </Field>
            </div>
          </div>
          <div className="mt-3">
            <Turnstile action="contact" onToken={setToken} />
          </div>
          {notice && (
            <FormNotice tone={notice.tone} className="mt-3">
              {notice.text}
            </FormNotice>
          )}
          <Button type="submit" disabled={busy} className="mt-4 w-full" size="lg">
            <Send size={17} />
            {busy ? 'กำลังส่ง…' : 'ส่งข้อความ'}
          </Button>
        </form>
      </div>
    </section>
  );
}
