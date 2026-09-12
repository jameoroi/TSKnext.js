'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { normaliseProvince, searchProvinces, TH_PROVINCES } from '@/shared/th-provinces.mjs';

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  placeholder?: string;
};

/**
 * เลือกจังหวัด 1 ใน 77 — พิมพ์เพื่อกรอง เลือกด้วยคีย์บอร์ด/แตะ
 * พิมพ์ค้างไว้โดยไม่เลือกจะทิ้ง เหลือค่าที่เลือกครั้งก่อน (กันที่อยู่มั่ว)
 */
export function ProvinceCombobox({ id, value, onChange, onBlur, invalid, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();

  const matches = open ? searchProvinces(query) : TH_PROVINCES;
  const shown = open ? query : value;

  useEffect(() => {
    if (active >= matches.length) setActive(0);
  }, [matches.length, active]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
        onBlur?.();
      }
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open, onBlur]);

  const scrollActive = () => {
    requestAnimationFrame(() => {
      list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
    });
  };

  const show = () => {
    if (open) return;
    setOpen(true);
    setQuery('');
    const at = matches.findIndex((r: { name: string }) => r.name === value);
    setActive(at < 0 ? 0 : at);
  };

  const hide = (commitTyped = true) => {
    if (!open) return;
    if (commitTyped && query.trim()) {
      const exact = normaliseProvince(query);
      if (exact) onChange(exact);
    }
    setOpen(false);
    setQuery('');
    onBlur?.();
  };

  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
    setQuery('');
    onBlur?.();
  };

  const move = (step: number) => {
    if (!open) {
      show();
      return;
    }
    if (!matches.length) return;
    setActive((a) => (a + step + matches.length) % matches.length);
    scrollActive();
  };

  return (
    <div ref={root} className="relative">
      <Input
        id={id}
        role="combobox"
        value={shown}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={Boolean(invalid)}
        autoComplete="address-level1"
        placeholder={placeholder || 'พิมพ์เพื่อค้นหาจังหวัด'}
        className="pr-9"
        onFocus={show}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            move(1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            move(-1);
          } else if (e.key === 'Enter') {
            if (!open) return;
            const row = matches[active];
            if (!row) return;
            e.preventDefault();
            choose(row.name);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            hide(false);
          } else if (e.key === 'Tab') {
            hide();
          }
        }}
        onBlur={() => hide()}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
      />
      {open && (
        <div
          id={listId}
          ref={list}
          role="listbox"
          aria-label="รายชื่อจังหวัด"
          className="absolute inset-x-0 top-[calc(100%+4px)] z-30 max-h-64 overflow-y-auto rounded-xl border bg-white p-1 shadow-xl"
        >
          {matches.map((p: { name: string; latin: string }, i: number) => (
            <div
              key={p.name}
              role="option"
              tabIndex={-1}
              aria-selected={p.name === value}
              data-active={i === active}
              onPointerEnter={() => setActive(i)}
              onPointerDown={(e) => {
                e.preventDefault();
                choose(p.name);
              }}
              className={`flex cursor-pointer items-baseline gap-2 rounded-lg px-3 py-2 ${i === active ? 'bg-emerald-50' : ''}`}
            >
              <span className={`text-sm ${p.name === value ? 'font-bold text-emerald-800' : ''}`}>
                {p.name}
              </span>
              <span className="text-[11px] text-slate-400">{p.latin}</span>
            </div>
          ))}
          {!matches.length && <div className="px-3 py-2.5 text-sm text-slate-400">ไม่พบจังหวัดที่ค้นหา</div>}
        </div>
      )}
    </div>
  );
}
