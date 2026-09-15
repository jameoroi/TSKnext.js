'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { type PointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import { motionPaused } from '@/lib/overlay-bus';
import type { CarouselSlide } from './banner-slides';

export type { CarouselSlide } from './banner-slides';

type Props = {
  slides: CarouselSlide[];
  /** Frame classes: aspect ratio, rounding. Ignored in background mode (fills its parent). */
  className?: string;
  /** Time each picture stays, in ms. */
  interval?: number;
  /** Which way the pictures travel. The shop's banners move to the right. */
  direction?: 'right' | 'left';
  /** Arrows and dots. */
  controls?: boolean;
  /** Decorative: fills the positioned parent behind its content, no links or controls. */
  background?: boolean;
  label?: string;
  imgClassName?: string;
};

/**
 * One carousel for every banner on the shop.
 *
 * Several pictures slide smoothly on their own, to the right by default, and
 * stop while the pointer or keyboard focus is on them. A picture that fails to
 * load is dropped instead of leaving a broken frame. The track keeps a copy of
 * the last picture before the first and of the first after the last, so the
 * loop always moves the same way instead of rewinding across every slide.
 */
export function BannerCarousel({
  slides,
  className = '',
  interval = 5000,
  direction = 'right',
  controls = true,
  background = false,
  label = 'แบนเนอร์',
  imgClassName = 'h-full w-full object-cover',
}: Props) {
  const [failed, setFailed] = useState<string[]>([]);
  const items = slides.filter((slide) => !failed.includes(slide.src));
  const count = items.length;
  const looped = count > 1;
  const track = looped ? [items[count - 1]!, ...items, items[0]!] : items;

  const [position, setPosition] = useState(looped ? 1 : 0);
  const [animate, setAnimate] = useState(true);
  const [paused, setPaused] = useState(false);
  const swipe = useRef<{ x: number; active: boolean }>({ x: 0, active: false });
  // A swipe that changed the slide must not also follow the slide's link.
  const swiped = useRef(false);
  const holdUntil = useRef(0);

  // Keep the position valid when the number of pictures changes (a failed image).
  useEffect(() => {
    setAnimate(false);
    setPosition(count > 1 ? 1 : 0);
  }, [count]);

  const step = useCallback(
    (delta: number) => {
      if (!looped) return;
      setAnimate(true);
      setPosition((current) => Math.max(0, Math.min(count + 1, current + delta)));
    },
    [looped, count],
  );

  const forward = direction === 'right' ? -1 : 1;

  useEffect(() => {
    if (!looped || paused) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || motionPaused() || Date.now() < holdUntil.current) return;
      step(forward);
    }, interval);
    return () => window.clearInterval(timer);
  }, [looped, paused, interval, forward, step]);

  function onTransitionEnd() {
    if (!looped) return;
    if (position === 0) {
      setAnimate(false);
      setPosition(count);
    } else if (position === count + 1) {
      setAnimate(false);
      setPosition(1);
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    swipe.current = { x: event.clientX, active: true };
    swiped.current = false;
    holdUntil.current = Date.now() + 60_000;
  }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!swipe.current.active) return;
    swipe.current.active = false;
    const moved = event.clientX - swipe.current.x;
    holdUntil.current = Date.now() + interval;
    if (Math.abs(moved) > 40) {
      swiped.current = true;
      step(moved > 0 ? -1 : 1);
    }
  }

  if (!count) return null;

  const current = looped ? (position - 1 + count) % count : 0;
  const markFailed = (src: string) => setFailed((list) => (list.includes(src) ? list : [...list, src]));

  const trackStyle = {
    transform: `translate3d(-${position * 100}%, 0, 0)`,
    transition: animate ? 'transform 900ms cubic-bezier(0.22, 0.61, 0.36, 1)' : 'none',
  };

  const frameClass = background
    ? 'pointer-events-none absolute inset-0 -z-10 overflow-hidden'
    : `relative overflow-hidden ${className}`;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover/focus only pauses the autoplay
    <div
      className={frameClass}
      aria-hidden={background || undefined}
      aria-roledescription={background ? undefined : 'carousel'}
      aria-label={background ? undefined : label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        className="flex h-full w-full touch-pan-y"
        style={trackStyle}
        onTransitionEnd={onTransitionEnd}
        onPointerDown={background ? undefined : onPointerDown}
        onPointerUp={background ? undefined : onPointerUp}
        onPointerCancel={() => {
          swipe.current.active = false;
          holdUntil.current = Date.now() + interval;
        }}
        onClickCapture={(event) => {
          if (!swiped.current) return;
          swiped.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {track.map((slide, index) => {
          const clone = looped && (index === 0 || index === track.length - 1);
          const visible = index === position;
          const image = (
            // biome-ignore lint/performance/noImgElement: banners are CMS/CDN URLs of arbitrary hosts
            <img
              src={slide.src}
              alt={background ? '' : slide.alt || label}
              loading={index <= 1 ? 'eager' : 'lazy'}
              decoding="async"
              draggable={false}
              className={imgClassName}
              onError={() => markFailed(slide.src)}
            />
          );
          const key = `${clone ? 'clone' : 'slide'}-${index}-${slide.src}`;
          return (
            <div
              key={key}
              className="relative h-full w-full shrink-0 grow-0 basis-full"
              aria-hidden={background || clone || !visible || undefined}
            >
              {!background && slide.href ? (
                slide.href.startsWith('/') ? (
                  <Link
                    href={slide.href}
                    tabIndex={visible ? undefined : -1}
                    aria-label={slide.alt || label}
                    className="block h-full"
                  >
                    {image}
                  </Link>
                ) : (
                  <a
                    href={slide.href}
                    target="_blank"
                    rel="noreferrer"
                    tabIndex={visible ? undefined : -1}
                    aria-label={slide.alt || label}
                    className="block h-full"
                  >
                    {image}
                  </a>
                )
              ) : (
                image
              )}
            </div>
          );
        })}
      </div>
      {!background && controls && looped && (
        <>
          <button
            type="button"
            aria-label="แบนเนอร์ก่อนหน้า"
            onClick={() => step(-1)}
            className="absolute left-3 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-slate-900 shadow transition hover:bg-white"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="แบนเนอร์ถัดไป"
            onClick={() => step(1)}
            className="absolute right-3 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-slate-900 shadow transition hover:bg-white"
          >
            <ChevronRight size={18} />
          </button>
          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
            {items.map((slide, index) => (
              <button
                key={`dot-${slide.src}-${index}`}
                type="button"
                aria-label={`ไปสไลด์ที่ ${index + 1}`}
                aria-current={index === current || undefined}
                onClick={() => {
                  setAnimate(true);
                  setPosition(index + 1);
                }}
                className={`h-2 rounded-full transition-all ${index === current ? 'w-6 bg-white' : 'w-2 bg-white/60'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
