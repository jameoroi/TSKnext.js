'use client';

import { Printer } from 'lucide-react';

export function PrintButton({ disabled = false }: { disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 print:hidden"
    >
      <Printer size={16} />
      พิมพ์ / บันทึก PDF
    </button>
  );
}
