'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Children, type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';

type Props = {
  children: ReactNode;
  itemClassName: string;
  label: string;
  speed?: number;
  arrows?: boolean;
  /** Which way the row travels. The shop's rows move to the right. */
  direction?: 'right' | 'left';
  /**
   * Only a single auto-scrolling row on phones. From the `sm` breakpoint up the
   * caller's `desktopClassName` (e.g. `sm:grid sm:grid-cols-4`) lays the same
   * items out as a grid, and the loop copies are hidden.
   */
  mobileOnly?: boolean;
  desktopClassName?: string;
};

const MOBILE_QUERY = '(max-width: 639px)';

/**
 * AutoRail — แถวเลื่อนอัตโนมัติแบบสมูท + เมาส์คลิกค้างลากได้ + ไม่มี scrollbar
 * - เล่นเองด้วย rAF drift (หยุดเมื่อ hover/focus/ลาก/แตะ)
 * - เนื้อหาซ้ำ 2 ชุดเพื่อวนซ้ำไร้รอยต่อ (เหมือน ProductRail ของ framework เดิม)
 * - เลื่อนไปทางขวาเป็นค่าเริ่มต้น; เครื่องที่ปิดแอนิเมชันยังเลื่อน แต่ช้าลง
 */
export function AutoRail({
  children,
  itemClassName,
  label,
  speed = 36,
  arrows = false,
  direction = 'right',
  mobileOnly = false,
  desktopClassName = '',
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const drag = useRef({ down: false, startX: 0, startLeft: 0 });

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pace = reduced ? speed * 0.6 : speed;
    const sign = direction === 'right' ? -1 : 1;
    const mobile = window.matchMedia(MOBILE_QUERY);
    let raf = 0;
    let last = performance.now();
    let placed = false;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const node = ref.current;
      if (!node || pausedRef.current || node.children.length < 2 || (mobileOnly && !mobile.matches)) {
        last = now;
        placed = false;
        return;
      }
      const half = node.scrollWidth / 2;
      if (half <= node.clientWidth / 2) {
        last = now;
        return;
      }
      // Moving right needs room on the left: start from the second copy.
      if (!placed) {
        if (sign < 0 && node.scrollLeft < 1) node.scrollLeft = half;
        placed = true;
      }
      const dt = Math.min(64, now - last);
      last = now;
      node.scrollLeft += (sign * pace * dt) / 1000;
      if (node.scrollLeft >= half) node.scrollLeft -= half;
      else if (node.scrollLeft <= 0) node.scrollLeft += half;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speed, direction, mobileOnly]);

  function endDrag() {
    if (!drag.current.down) return;
    drag.current.down = false;
    window.setTimeout(() => setPaused(false), 2000);
  }

  function move(step: -1 | 1) {
    const node = ref.current;
    if (!node) return;
    node.scrollBy({ left: step * Math.max(260, node.clientWidth * 0.75), behavior: 'smooth' });
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const node = ref.current;
    if (!node) return;
    drag.current = { down: true, startX: event.clientX, startLeft: node.scrollLeft };
    setPaused(true);
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const node = ref.current;
    if (!drag.current.down || !node) return;
    node.scrollLeft = drag.current.startLeft - (event.clientX - drag.current.startX);
  }

  const items = Children.toArray(children);
  const loop = items.length > 1 ? [...items, ...items] : items;
  const railClass = mobileOnly
    ? `flex cursor-grab gap-3 overflow-x-auto pb-2 touch-pan-x active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:cursor-auto sm:overflow-visible sm:pb-0 ${desktopClassName}`
    : 'flex cursor-grab gap-3 overflow-x-auto pb-2 touch-pan-x active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover pauses autoplay (a11y feature, not interaction)
    <div
      className="relative min-w-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => {
        setPaused(false);
        endDrag();
      }}
    >
      <section
        ref={ref}
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        className={railClass}
      >
        {loop.map((child, i) => {
          const copy = i >= items.length;
          return (
            <div
              key={copy ? `loop-${i}` : `rail-${i}`}
              aria-hidden={copy || undefined}
              className={`${itemClassName}${copy && mobileOnly ? ' sm:hidden' : ''}`}
            >
              {child}
            </div>
          );
        })}
      </section>
      {arrows && items.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="ก่อนหน้า"
            className="absolute left-1 top-1/2 z-10 hidden size-9 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white shadow-md md:grid"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="ถัดไป"
            className="absolute right-1 top-1/2 z-10 hidden size-9 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white shadow-md md:grid"
          >
            <ChevronRight className="size-4" />
          </button>
        </>
      )}
    </div>
  );
}
