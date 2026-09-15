'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthModalStore } from '@/features/auth/modal-store';
import { useOverlayFlag } from '@/lib/overlay-bus';

type EntryPopup = {
  enabled?: boolean;
  image_url?: string;
  link_url?: string;
  alt_text?: string;
  frequency?: 'session' | 'daily' | 'always';
  delay_ms?: number;
  start_at?: string;
  end_at?: string;
};

const MIN_AUTO_DELAY_MS = 30_000;

function dateBoundary(value: unknown, end = false) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const stamp = Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T${end ? '23:59:59.999' : '00:00:00'}` : raw,
  );
  return Number.isFinite(stamp) ? stamp : null;
}

export function EntryPopup({ popup }: { popup?: EntryPopup | null }) {
  const config = popup || {};
  const authOpen = useAuthModalStore((state) => state.open);
  const [visible, setVisible] = useState(false);
  const image = String(config.image_url || '').trim();
  const storageKey = useMemo(() => {
    let hash = 0;
    for (let index = 0; index < image.length; index += 1)
      hash = ((hash << 5) - hash + image.charCodeAt(index)) | 0;
    return `tsk-entry-popup:${Math.abs(hash)}`;
  }, [image]);

  useEffect(() => {
    if (config.enabled !== true || !image) return;
    const now = Date.now();
    const starts = dateBoundary(config.start_at);
    const ends = dateBoundary(config.end_at, true);
    if ((starts !== null && now < starts) || (ends !== null && now > ends)) return;
    try {
      if (
        config.frequency === 'daily' &&
        localStorage.getItem(storageKey) === new Date().toISOString().slice(0, 10)
      )
        return;
      if (
        config.frequency !== 'always' &&
        config.frequency !== 'daily' &&
        sessionStorage.getItem(storageKey) === '1'
      )
        return;
    } catch {}
    const timer = window.setTimeout(
      () => {
        if (!useAuthModalStore.getState().open) setVisible(true);
      },
      Math.max(MIN_AUTO_DELAY_MS, Number(config.delay_ms || 0)),
    );
    return () => window.clearTimeout(timer);
  }, [config.delay_ms, config.enabled, config.end_at, config.frequency, config.start_at, image, storageKey]);

  useEffect(() => {
    if (authOpen && visible) setVisible(false);
  }, [authOpen, visible]);

  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setVisible(false);
    };
    window.addEventListener('keydown', key);
    try {
      if (config.frequency === 'daily')
        localStorage.setItem(storageKey, new Date().toISOString().slice(0, 10));
      else if (config.frequency !== 'always') sessionStorage.setItem(storageKey, '1');
    } catch {}
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', key);
    };
  }, [config.frequency, storageKey, visible]);

  // The cookie notice and the recently viewed card wait while this is open,
  // and the moving rows behind it hold still.
  useOverlayFlag('entry-popup', visible && Boolean(image));

  if (!visible || !image) return null;
  const artwork = (
    <img
      src={image}
      alt={String(config.alt_text || 'โปรโมชันพิเศษ')}
      width={680}
      height={620}
      onError={() => setVisible(false)}
      className="block max-h-[86vh] w-full object-contain"
    />
  );
  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-emerald-950/45 p-5 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) setVisible(false);
      }}
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={String(config.alt_text || 'โปรโมชันพิเศษ')}
        className="relative w-full max-w-[680px]"
      >
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="ปิดป๊อปอัพ"
          className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-emerald-950/90 text-2xl text-white shadow-lg"
        >
          ×
        </button>
        {config.link_url ? (
          <a href={String(config.link_url)} onClick={() => setVisible(false)}>
            {artwork}
          </a>
        ) : (
          artwork
        )}
      </section>
    </div>
  );
}
