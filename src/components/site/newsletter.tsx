'use client';

import { Mail, Send } from 'lucide-react';
import { useState } from 'react';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';

export function Newsletter() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value || busy) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await legacyRequest('newsletter.subscribe', { email: value }, 'POST');
      setMessage('สมัครรับข่าวสารเรียบร้อยแล้ว ตรวจสอบอีเมลเพื่อยืนยัน');
      setEmail('');
    } catch (cause) {
      const code = cause instanceof LegacyApiError ? cause.code : '';
      if (code === 'already_subscribed' || code === 'newsletter_exists') {
        setMessage('อีเมลนี้อยู่ในรายชื่อรับข่าวสารแล้ว');
      } else if (code === 'rate_limited' || (cause instanceof LegacyApiError && cause.status === 429)) {
        setError('ส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่');
      } else {
        setError('สมัครรับข่าวสารไม่สำเร็จ กรุณาตรวจอีเมลแล้วลองอีกครั้ง');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-7xl px-6 pt-10" aria-labelledby="newsletter-title">
      <div className="grid gap-5 rounded-3xl border border-emerald-700/60 bg-emerald-900/70 p-5 shadow-[0_20px_60px_rgba(0,0,0,.16)] md:grid-cols-[1fr_minmax(360px,520px)] md:items-center md:p-7">
        <div className="flex gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-emerald-100">
            <Mail className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="newsletter-title" className="font-bold text-white">
              รับข่าวสารและโปรโมชั่น
            </h2>
            <p className="mt-1 text-sm leading-6 text-emerald-100/70">
              สินค้าเข้าใหม่ ส่วนลดพิเศษ และเคล็ดลับการใช้งาน ส่งตรงถึงอีเมลคุณ
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="sr-only" htmlFor="newsletter-email">
            อีเมลของคุณ
          </label>
          <input
            id="newsletter-email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="กรอกอีเมลของคุณ"
            className="h-12 min-w-0 rounded-xl border border-white/15 bg-white px-4 text-sm text-slate-950 outline-none ring-emerald-300 transition focus:ring-2"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-emerald-950 transition hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
          >
            <Send className="size-4" aria-hidden="true" />
            {busy ? 'กำลังสมัคร…' : 'สมัครรับข่าว'}
          </button>
          {message ? (
            <p className="text-sm font-medium text-emerald-200 sm:col-span-2" role="status">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="text-sm font-medium text-rose-200 sm:col-span-2" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </div>
    </section>
  );
}
