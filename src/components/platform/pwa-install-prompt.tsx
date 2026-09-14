'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const KEY = 'tsk_pwa_prompt';
const HIDDEN = ['/checkout', '/cart', '/admin', '/login'];

export function PwaInstallPrompt() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<'install' | 'ios'>('install');
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const answered = () => {
      try {
        return Boolean(localStorage.getItem(KEY));
      } catch {
        return true;
      }
    };
    const phone = () => window.matchMedia('(max-width: 760px)').matches;
    const standalone = () =>
      window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as any).standalone);
    const allowed = () => !HIDDEN.some((prefix) => pathname.startsWith(prefix));
    const offer = (kind: 'install' | 'ios') => {
      if (phone() && !standalone() && !answered() && allowed()) {
        setMode(kind);
        setVisible(true);
      }
    };
    const before = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallEvent);
      offer('install');
    };
    const installed = () => {
      try {
        localStorage.setItem(KEY, 'installed');
      } catch {}
      setVisible(false);
    };
    window.addEventListener('beforeinstallprompt', before);
    window.addEventListener('appinstalled', installed);
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    const timer = ios ? window.setTimeout(() => offer('ios'), 6000) : 0;
    return () => {
      window.removeEventListener('beforeinstallprompt', before);
      window.removeEventListener('appinstalled', installed);
      if (timer) window.clearTimeout(timer);
    };
  }, [pathname]);

  function remember(value: string) {
    try {
      localStorage.setItem(KEY, value);
    } catch {}
  }
  async function install() {
    setVisible(false);
    if (!deferred) {
      remember('dismissed');
      return;
    }
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
    remember(choice.outcome === 'accepted' ? 'installed' : 'dismissed');
    setDeferred(null);
  }
  function dismiss() {
    setVisible(false);
    remember('dismissed');
  }

  if (!visible) return null;
  return (
    <aside
      role="dialog"
      aria-label="ติดตั้งแอป THAISERKIT SUPPLY"
      className="fixed inset-x-3 bottom-20 z-[70] mx-auto flex max-w-xl items-center gap-3 rounded-2xl border bg-white p-3 shadow-2xl md:bottom-5"
    >
      <Image
        src="/legacy-assets/logo.png"
        alt=""
        width={48}
        height={48}
        className="size-12 rounded-xl object-contain"
      />
      <div className="min-w-0 flex-1">
        <b className="block text-sm">ติดตั้งแอป THAISERKIT</b>
        <small className="mt-1 block text-xs leading-5 text-slate-500">
          {mode === 'install'
            ? 'เปิดร้านจากหน้าจอโฮมได้เร็วขึ้น โดยไม่ต้องค้นหาเว็บใหม่ทุกครั้ง'
            : 'บน iPhone/iPad กด แชร์ แล้วเลือก เพิ่มไปยังหน้าจอโฮม'}
        </small>
      </div>
      <div className="flex shrink-0 gap-2">
        {mode === 'install' && (
          <button
            type="button"
            onClick={() => void install()}
            className="rounded-xl bg-emerald-950 px-3 py-2 text-xs font-black text-white"
          >
            ติดตั้ง
          </button>
        )}
        <button type="button" onClick={dismiss} className="rounded-xl border px-3 py-2 text-xs font-bold">
          ไว้ก่อน
        </button>
      </div>
    </aside>
  );
}
