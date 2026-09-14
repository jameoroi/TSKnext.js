'use client';

import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useAuthModalStore } from '@/features/auth/modal-store';
import { LoginForm } from './login-form';

export function AuthModal() {
  const { open, tab, redirect, hide } = useAuthModalStore();
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) hide();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[105] bg-emerald-950/60 backdrop-blur-sm" />
        <Dialog.Content
          data-radix-ui="dialog"
          className="fixed bottom-0 left-1/2 z-[106] max-h-[92dvh] w-full max-w-[470px] -translate-x-1/2 overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl outline-none sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:p-7"
        >
          <Dialog.Close
            className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
            aria-label="ปิด"
          >
            <X className="size-5" />
          </Dialog.Close>
          <div className="pr-10">
            <span className="text-[11px] font-black uppercase tracking-[.16em] text-rose-600">
              THAISERKIT SUPPLY
            </span>
            <Dialog.Title className="mt-1 text-2xl font-black text-emerald-950">ยินดีต้อนรับกลับมา</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm leading-6 text-slate-500">
              เข้าสู่ระบบเพื่อสั่งซื้อ ติดตามคำสั่งซื้อ และเก็บรายการโปรดข้ามอุปกรณ์
            </Dialog.Description>
          </div>
          <div className="mt-5">
            <LoginForm
              key={`${tab}:${redirect}:${open}`}
              compact
              initialTab={tab}
              redirectTo={redirect}
              onSuccess={hide}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
