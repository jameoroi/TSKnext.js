'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { readConsent, writeConsent } from '@/features/privacy/consent';

export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const current = readConsent();
    if (!current) setOpen(true);
    else {
      setAnalytics(current.analytics);
      setMarketing(current.marketing);
    }
    const reopen = () => {
      const next = readConsent();
      setAnalytics(next?.analytics === true);
      setMarketing(next?.marketing === true);
      setDetail(true);
      setOpen(true);
    };
    window.addEventListener('tsk:open-consent', reopen);
    return () => window.removeEventListener('tsk:open-consent', reopen);
  }, []);

  function save(next: { analytics: boolean; marketing: boolean }) {
    const previous = readConsent();
    writeConsent(next);
    setOpen(false);
    // Browser pixels cannot be unloaded safely. If consent is withdrawn after
    // they started, reload once so the next document starts with the new gate.
    if ((previous?.analytics && !next.analytics) || (previous?.marketing && !next.marketing))
      window.location.reload();
  }

  const bannerRef = useRef<HTMLElement | null>(null);

  // Publish the banner's height as --tsk-consent-h so everything pinned to
  // the bottom of the screen (recently viewed bar, compare bar) sits above it
  // instead of underneath. Zero whenever the banner is closed.
  useEffect(() => {
    const root = document.documentElement;
    const node = bannerRef.current;
    if (!open || !node) {
      root.style.setProperty('--tsk-consent-h', '0px');
      return;
    }
    const update = () =>
      root.style.setProperty('--tsk-consent-h', `${Math.ceil(node.getBoundingClientRect().height) + 12}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.setProperty('--tsk-consent-h', '0px');
    };
  }, [open, detail]);

  if (!open) return null;
  return (
    <aside
      ref={bannerRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1 basis-[360px]">
          <strong id="cookie-consent-title" className="text-base font-black text-slate-950">
            เว็บไซต์นี้ใช้คุกกี้
          </strong>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            เราใช้คุกกี้ที่จำเป็นเพื่อให้ตะกร้า การเข้าสู่ระบบ และความปลอดภัยทำงานได้ ส่วนสถิติและโฆษณาจะเริ่มหลังคุณยินยอมเท่านั้น{' '}
            <Link href="/privacy" className="font-semibold text-emerald-800 underline">
              อ่านนโยบายความเป็นส่วนตัว
            </Link>
          </p>
          {detail && (
            <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-3">
              <label className="flex items-start gap-3">
                <input type="checkbox" checked disabled className="mt-1" />
                <span>
                  <b className="block text-sm">จำเป็นต่อการใช้งาน</b>
                  <small className="text-xs text-slate-500">ตะกร้า เซสชัน และความปลอดภัย ปิดไม่ได้</small>
                </span>
              </label>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(event) => setAnalytics(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  <b className="block text-sm">สถิติการใช้งาน</b>
                  <small className="text-xs text-slate-500">PostHog และสถิติที่ช่วยปรับปรุงประสบการณ์ใช้งาน</small>
                </span>
              </label>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(event) => setMarketing(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  <b className="block text-sm">โฆษณาและการตลาด</b>
                  <small className="text-xs text-slate-500">
                    Google, Meta, TikTok และ Floodlight ตามที่ร้านตั้งค่าไว้
                  </small>
                </span>
              </label>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!detail ? (
            <button
              type="button"
              onClick={() => setDetail(true)}
              className="rounded-xl border px-4 py-2 text-sm font-bold"
            >
              เลือกเอง
            </button>
          ) : (
            <button
              type="button"
              onClick={() => save({ analytics, marketing })}
              className="rounded-xl border px-4 py-2 text-sm font-bold"
            >
              บันทึกที่เลือก
            </button>
          )}
          <button
            type="button"
            onClick={() => save({ analytics: false, marketing: false })}
            className="rounded-xl border px-4 py-2 text-sm font-bold"
          >
            ปฏิเสธทั้งหมด
          </button>
          <button
            type="button"
            onClick={() => save({ analytics: true, marketing: true })}
            className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-bold text-white"
          >
            ยอมรับทั้งหมด
          </button>
        </div>
      </div>
    </aside>
  );
}
