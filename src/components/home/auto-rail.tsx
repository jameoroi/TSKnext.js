'use client';

import { Children, type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';

type Props = {
  children: ReactNode;
  itemClassName: string;
  label: string;
  speed?: number;
};

/**
 * AutoRail — แถวเลื่อนอัตโนมัติแบบสมูท + เมาส์คลิกค้างลากได้ + ไม่มี scrollbar
 * - เล่นเองด้วย rAF drift (หยุดเมื่อ hover/focus/ลาก/แตะ, เคารพ reduced-motion)
 * - เนื้อหาซ้ำ 2 ชุดเพื่อวนซ้ำไร้รอยต่อ (เหมือน ProductRail ของ framework เดิม)
 */
export function AutoRail({ children, itemClassName, label, speed = 36 }: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const drag = useRef({ down: false, startX: 0, startLeft: 0 });

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const node = ref.current;
      if (!node || pausedRef.current || node.children.length < 2) {
        last = now;
        return;
      }
      const dt = Math.min(64, now - last);
      last = now;
      node.scrollLeft += (speed * dt) / 1000;
      const half = node.scrollWidth / 2;
      if (half > 0 && node.scrollLeft >= half) node.scrollLeft -= half;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speed]);

  function endDrag() {
    if (!drag.current.down) return;
    drag.current.down = false;
    window.setTimeout(() => setPaused(false), 2000);
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
        className="flex cursor-grab gap-3 overflow-x-auto pb-2 touch-pan-x active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {loop.map((child, i) => (
          <div
            key={i >= items.length ? `loop-${i}` : `rail-${i}`}
            aria-hidden={i >= items.length || undefined}
            className={itemClassName}
          >
            {child}
          </div>
        ))}
      </section>
    </div>
  );
}
