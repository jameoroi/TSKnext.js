'use client';

import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useToastStore } from '@/features/ui/toast-store';

export function ToastHost() {
  const { visible, message, tone, hide, nonce } = useToastStore();
  const Icon = tone === 'bad' ? AlertCircle : tone === 'info' ? Info : CheckCircle2;
  return (
    <div
      className="pointer-events-none fixed inset-x-3 top-3 z-[120] flex justify-center sm:inset-x-auto sm:right-5 sm:top-5"
      aria-live={tone === 'bad' ? 'assertive' : 'polite'}
    >
      <AnimatePresence mode="wait">
        {visible && message ? (
          <motion.div
            key={nonce}
            initial={{ opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            role={tone === 'bad' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur ${tone === 'bad' ? 'border-rose-200 bg-rose-50/95 text-rose-900' : tone === 'info' ? 'border-sky-200 bg-sky-50/95 text-sky-900' : 'border-emerald-200 bg-emerald-50/95 text-emerald-950'}`}
          >
            <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-sm font-semibold leading-6">{message}</span>
            <button
              type="button"
              onClick={hide}
              className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-black/5"
              aria-label="ปิดข้อความ"
            >
              <X className="size-4" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
