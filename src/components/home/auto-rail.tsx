'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Children,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { motionPaused } from '@/lib/overlay-bus';

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
/** How long the row waits after a finger or mouse lets go before moving again. */
const RESUME_AFTER_MS = 2500;
/** A press that moves further than this is a drag, not a tap. */
const DRAG_THRESHOLD_PX = 6;

/**
 * AutoRail — แถวเลื่อนอัตโนมัติแบบสมูท + ลากได้ + ไม่มี scrollbar
 *
 * - เลื่อนไปทางขวาเป็นค่าเริ่มต้น; เครื่องที่ปิดแอนิเมชันยังเลื่อน แต่ช้าลง
 * - หยุดเมื่อ hover/focus, เมื่อมีป๊อปอัพหรือหน้าต่างเปิดทับ (overlay bus)
 * - นิ้วมีสิทธิ์ก่อนเสมอ: ระหว่างปัด/เลื่อนด้วยมือ แถวจะไม่แย่งเลื่อน และจะกลับมา
 *   เลื่อนเองหลังปล่อยมือ 2.5 วินาที (เดิมทั้งสองฝั่งเขียน scrollLeft พร้อมกัน
 *   ทำให้ภาพกระตุกและกดโดนการ์ดผิดใบ)
 * - ลากด้วยเมาส์แล้วปล่อย ไม่นับเป็นการคลิกลิงก์ในการ์ด
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
  const [hovered, setHovered] = useState(false);
  const hoveredRef = useRef(false);
  const holdUntil = useRef(0);
  const touching = useRef(false);
  const expectedLeft = useRef<number | null>(null);
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: 0 });
  const suppressClick = useRef(false);

  useEffect(() => {
    hoveredRef.current = hovered;
  }, [hovered]);

  const hold = (ms = RESUME_AFTER_MS) => {
    holdUntil.current = Math.max(holdUntil.current, performance.now() + ms);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const node = ref.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pace = reduced ? speed * 0.6 : speed;
    const sign = direction === 'right' ? -1 : 1;
    const mobile = window.matchMedia(MOBILE_QUERY);
    let raf = 0;
    let last = performance.now();
    let position = -1;

    // A scroll we did not make is the visitor's: stand back until they are done.
    const onScroll = () => {
      if (!node) return;
      const expected = expectedLeft.current;
      if (expected === null || Math.abs(node.scrollLeft - expected) > 2) {
        hold();
        position = -1;
      }
    };
    const onTouchStart = () => {
      touching.current = true;
      hold(60_000);
    };
    const onTouchEnd = () => {
      touching.current = false;
      holdUntil.current = performance.now() + RESUME_AFTER_MS;
      position = -1;
    };
    node?.addEventListener('scroll', onScroll, { passive: true });
    node?.addEventListener('touchstart', onTouchStart, { passive: true });
    node?.addEventListener('touchend', onTouchEnd, { passive: true });
    node?.addEventListener('touchcancel', onTouchEnd, { passive: true });

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const blocked =
        !node ||
        hoveredRef.current ||
        touching.current ||
        drag.current.down ||
        now < holdUntil.current ||
        motionPaused() ||
        document.visibilityState !== 'visible' ||
        node.children.length < 2 ||
        (mobileOnly && !mobile.matches);
      if (blocked) {
        last = now;
        return;
      }
      const half = node.scrollWidth / 2;
      if (half <= node.clientWidth / 2) {
        last = now;
        return;
      }
      if (position < 0) {
        position = node.scrollLeft;
        // Moving right needs room on the left: start from the second copy.
        if (sign < 0 && position < 1) position = half;
      }
      const dt = Math.min(64, now - last);
      last = now;
      position += (sign * pace * dt) / 1000;
      if (position >= half) position -= half;
      else if (position <= 0) position += half;
      node.scrollLeft = position;
      expectedLeft.current = node.scrollLeft;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      node?.removeEventListener('scroll', onScroll);
      node?.removeEventListener('touchstart', onTouchStart);
      node?.removeEventListener('touchend', onTouchEnd);
      node?.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [speed, direction, mobileOnly]);

  function move(step: -1 | 1) {
    const node = ref.current;
    if (!node) return;
    hold(RESUME_AFTER_MS + 600);
    node.scrollBy({ left: step * Math.max(260, node.clientWidth * 0.75), behavior: 'smooth' });
  }

  // Mouse only: a finger scrolls the row natively and must not be fought.
  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const node = ref.current;
    if (!node) return;
    drag.current = { down: true, startX: event.clientX, startLeft: node.scrollLeft, moved: 0 };
    suppressClick.current = false;
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const node = ref.current;
    if (!drag.current.down || !node) return;
    const delta = event.clientX - drag.current.startX;
    drag.current.moved = Math.max(drag.current.moved, Math.abs(delta));
    if (drag.current.moved > DRAG_THRESHOLD_PX) {
      node.scrollLeft = drag.current.startLeft - delta;
      expectedLeft.current = node.scrollLeft;
    }
  }

  function endDrag() {
    if (!drag.current.down) return;
    suppressClick.current = drag.current.moved > DRAG_THRESHOLD_PX;
    drag.current.down = false;
    hold();
  }

  function onClickCapture(event: MouseEvent<HTMLElement>) {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
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
        onClickCapture={onClickCapture}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className={railClass}
      >
        {loop.map((child, i) => {
          const copy = i >= items.length;
          return (
            <div
              key={copy ? `loop-${i}` : `rail-${i}`}
              aria-hidden={copy || undefined}
              className={`grid ${itemClassName}${copy && mobileOnly ? ' sm:hidden' : ''}`}
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
