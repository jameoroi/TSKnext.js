import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900',
        className,
      )}
      {...props}
    />
  );
}
