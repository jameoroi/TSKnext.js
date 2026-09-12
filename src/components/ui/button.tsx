import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const buttonVariants = cva('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:pointer-events-none disabled:opacity-50', {
  variants: {
    variant: {
      default: 'bg-emerald-900 text-white hover:bg-emerald-800',
      secondary: 'bg-emerald-50 text-emerald-950 hover:bg-emerald-100',
      outline: 'border border-emerald-900/15 bg-white text-emerald-950 hover:bg-emerald-50',
      ghost: 'text-emerald-950 hover:bg-emerald-50',
      danger: 'bg-red-600 text-white hover:bg-red-700',
    },
    size: { default: 'h-11 px-5', sm: 'h-9 px-3', lg: 'h-13 px-7 text-base', icon: 'size-10' },
  }, defaultVariants: { variant: 'default', size: 'default' },
});

export function Button({ className, variant, size, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
export { buttonVariants };
