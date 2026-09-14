'use client';

import { useEffect, useMemo, useState } from 'react';

function parts(endsAt: string, now: number) {
  const end = new Date(endsAt).getTime();
  const ms = Number.isFinite(end) ? Math.max(0, end - now) : 0;
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    live: ms > 0,
    days: Math.floor(ms / 86_400_000),
    hours: pad(Math.floor(ms / 3_600_000) % 24),
    minutes: pad(Math.floor(ms / 60_000) % 60),
    seconds: pad(Math.floor(ms / 1_000) % 60),
  };
}

export function SaleCountdown({ endsAt }: { endsAt?: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [endsAt]);
  const time = useMemo(() => (endsAt ? parts(endsAt, now) : null), [endsAt, now]);
  // No countdown configured: render nothing (the normal state). A configured
  // countdown that has expired renders an ended badge instead of vanishing —
  // otherwise the flash-sale heading column collapses to an empty block.
  if (!time) return null;
  if (!time.live)
    return (
      <div className="flex flex-wrap items-center gap-1.5" role="timer" aria-label="หมดเวลาแล้ว">
        <span className="mr-1 text-sm font-black text-white">หมดเวลาแล้ว</span>
      </div>
    );
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="timer"
      aria-label={`เหลือเวลา ${time.days} วัน ${time.hours} ชั่วโมง ${time.minutes} นาที ${time.seconds} วินาที`}
    >
      <span className="mr-1 text-sm font-black text-white">เหลือเวลาอีก</span>
      {time.days > 0 && <Time value={String(time.days)} label="วัน" />}
      <Time value={time.hours} label="ชั่วโมง" />
      <Time value={time.minutes} label="นาที" />
      <Time value={time.seconds} label="วินาที" />
    </div>
  );
}

function Time({ value, label }: { value: string; label: string }) {
  return (
    <span className="grid min-w-14 place-items-center rounded-xl bg-black/35 px-2.5 py-1.5 shadow-inner">
      <strong className="text-xl font-black tabular-nums text-white">{value}</strong>
      <small className="text-[10px] font-bold text-white/80">{label}</small>
    </span>
  );
}
