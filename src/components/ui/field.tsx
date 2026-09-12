'use client';

import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Input } from './input';

type FieldProps = {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
};

/**
 * มาตรฐานฟิลด์ฟอร์ม: label + เครื่องหมาย required + hint + error (role=alert).
 * ใช้คู่กับ Input / Textarea / Select เพื่อ aria ที่ถูกต้องโดยอัตโนมัติไม่ได้ —
 * ผู้ใช้ต้องส่ง aria-invalid/aria-describedby เองเมื่อต้องการผูก error กับ input
 * โดยใช้ id จาก errorId ที่ render (ดูตัวอย่างในฟอร์ม storefront)
 */
export function Field({ label, required, hint, error, htmlFor, className, children }: FieldProps) {
  return (
    <label htmlFor={htmlFor} className={cn('block', className)}>
      <span className="mb-1.5 block text-sm font-semibold text-slate-800">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-rose-600">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (จำเป็น)</span> : null}
      </span>
      {children}
      {hint && !error ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
      {error ? (
        <span role="alert" className="mt-1 block text-xs font-semibold text-rose-600">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-28 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select
        className={cn(
          'h-11 w-full appearance-none rounded-xl border border-slate-300 bg-white pl-3 pr-9 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
      />
    </span>
  );
}

type NoticeProps = {
  tone: 'ok' | 'bad' | 'info';
  title?: string;
  className?: string;
  children: ReactNode;
};

const noticeTone: Record<NoticeProps['tone'], string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  bad: 'border-rose-200 bg-rose-50 text-rose-800',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
};

/** กล่องแจ้งผลฟอร์ม — tone bad จะมี role="alert" ให้อัตโนมัติ */
export function FormNotice({ tone, title, className, children }: NoticeProps) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={cn('rounded-xl border p-3 text-sm leading-6', noticeTone[tone], className)}
    >
      {title ? <strong className="block font-bold">{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}

/** ช่องรหัสผ่านพร้อมปุ่มแสดง/ซ่อน */
export function PasswordInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  return (
    <span className="relative block">
      <Input type={shown ? 'text' : 'password'} className={cn('pr-12', className)} {...props} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
        aria-pressed={shown}
        className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </span>
  );
}
