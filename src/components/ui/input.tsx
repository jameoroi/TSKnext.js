import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10',
        className,
      )}
      {...props}
    />
  );
}
