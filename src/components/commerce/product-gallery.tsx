'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { type Product, productCardImages, productGalleryImages } from '@/features/catalog/types';
import imageLoader from '@/lib/image-loader';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'tsk-image-zoom': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        'zoom-src'?: string;
        zoom?: number;
      };
    }
  }
}

// One thumbnail per photo: renditions of the same image are not repeated.
function uniqueImages(product: Product) {
  return productGalleryImages(product);
}

// Large enough to stay sharp at 2.5x over a ~600px preview.
const zoomSource = (src: string) => imageLoader({ src, width: 1920, quality: 90 });

type RailProps = {
  images: string[];
  active: string;
  name: string;
  onSelect: (image: string) => void;
};

/** Thumbnail strip with round prev/next buttons instead of a scrollbar. */
function ThumbnailRail({ images, active, name, onSelect }: RailProps) {
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });

  const measure = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    // A few px of slack: the rail's px-1 padding and snapping leave scrollLeft at ~4 at rest.
    setEdges({
      prev: el.scrollLeft > 8,
      next: el.scrollLeft + el.clientWidth < el.scrollWidth - 8,
    });
  }, []);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  // Keep the selected thumbnail in view without scrolling the page itself.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the selection changes; the DOM carries it
  useEffect(() => {
    const el = rail.current;
    const thumb = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el || !thumb) return;
    const left = thumb.offsetLeft - el.offsetLeft;
    if (left < el.scrollLeft) el.scrollTo({ left: left - 8, behavior: 'smooth' });
    else if (left + thumb.offsetWidth > el.scrollLeft + el.clientWidth)
      el.scrollTo({ left: left + thumb.offsetWidth - el.clientWidth + 8, behavior: 'smooth' });
  }, [active]);

  const page = (direction: -1 | 1) => {
    const el = rail.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const arrow =
    'absolute top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-md backdrop-blur transition hover:scale-105 hover:border-emerald-600 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:pointer-events-none disabled:opacity-0';

  return (
    <div className="relative mt-3">
      <button
        type="button"
        onClick={() => page(-1)}
        disabled={!edges.prev}
        className={`${arrow} -left-2`}
        aria-label="รูปก่อนหน้า"
      >
        <ChevronLeft size={18} strokeWidth={2.5} />
      </button>
      <div
        ref={rail}
        onScroll={measure}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          maskImage: `linear-gradient(to right, ${edges.prev ? 'transparent' : '#000'}, #000 2.5rem, #000 calc(100% - 2.5rem), ${edges.next ? 'transparent' : '#000'})`,
        }}
      >
        {images.map((image, index) => (
          <button
            key={`${image}-${index}`}
            type="button"
            onClick={() => onSelect(image)}
            onMouseEnter={() => onSelect(image)}
            className={`relative size-16 shrink-0 snap-start overflow-hidden rounded-xl border bg-white transition sm:size-[4.5rem] ${active === image ? 'border-emerald-700 ring-2 ring-emerald-700/30' : 'hover:border-slate-400'}`}
            aria-label={`ดูรูปที่ ${index + 1}`}
            aria-pressed={active === image}
          >
            <Image
              src={image}
              alt={`${name} ${index + 1}`}
              fill
              sizes="72px"
              className="object-contain"
              unoptimized={image.startsWith('data:')}
            />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => page(1)}
        disabled={!edges.next}
        className={`${arrow} -right-2`}
        aria-label="รูปถัดไป"
      >
        <ChevronRight size={18} strokeWidth={2.5} />
      </button>
    </div>
  );
}

export function ProductGallery({ product }: { product: Product }) {
  const images = useMemo(() => uniqueImages(product), [product]);
  const [active, setActive] = useState(images[0] || '/legacy-assets/logo.png');
  const [fullView, setFullView] = useState(false);
  // The main photo has w240/w480/w960 renditions: show the 960 one (much lighter on
  // phones, where the original made LCP ~11 s) and keep the original for zoom and full view.
  const displaySrc = active === images[0] ? productCardImages(product, 960)[0] || active : active;

  // The Lit element touches HTMLElement, which Workers SSR does not have, so it
  // is only loaded in the browser. Until then <tsk-image-zoom> is a plain box.
  useEffect(() => {
    void import('./tsk-image-zoom');
  }, []);

  const rail =
    images.length > 1 ? (
      <ThumbnailRail images={images} active={active} name={product.name} onSelect={setActive} />
    ) : null;

  return (
    <div>
      {/* No overflow-hidden: the zoom pane opens outside this frame, beside the photo. */}
      <div className="relative z-30 aspect-square rounded-3xl border bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setFullView(true)}
          className="block size-full cursor-zoom-in rounded-3xl focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-emerald-700"
          aria-label={`ดูภาพ ${product.name} แบบเต็ม`}
        >
          <tsk-image-zoom zoom-src={zoomSource(active)} zoom={2.5} className="rounded-3xl">
            {/* Edge to edge, no white margin; this inner layer clips the corners
                so the frame above can stay unclipped for the zoom pane. */}
            <span className="relative block size-full overflow-hidden rounded-3xl">
              <Image
                src={displaySrc}
                alt={product.name}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain"
                unoptimized={displaySrc.startsWith('data:')}
              />
            </span>
          </tsk-image-zoom>
        </button>
      </div>
      {rail}
      <p className="mt-2 text-center text-xs text-slate-500">
        <span className="hidden [@media(hover:hover)]:inline">วางเมาส์บนรูปเพื่อซูม · คลิกเพื่อดูภาพเต็ม</span>
        <span className="[@media(hover:hover)]:hidden">แตะรูปเพื่อดูภาพเต็ม</span>
      </p>

      <Dialog open={fullView} onOpenChange={setFullView}>
        <DialogContent className="flex max-h-[95vh] max-w-5xl flex-col gap-3 p-3 sm:p-6">
          <DialogPrimitive.Title className="pr-10 text-sm font-semibold text-slate-800 sm:text-base">
            {product.name}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            ภาพสินค้าแบบเต็ม เลือกรูปอื่นได้จากแถบด้านล่าง
          </DialogPrimitive.Description>
          <div className="relative h-[70vh] w-full">
            <Image
              src={zoomSource(active)}
              alt={product.name}
              fill
              sizes="100vw"
              className="object-contain"
              unoptimized
            />
          </div>
          {rail}
        </DialogContent>
      </Dialog>
    </div>
  );
}
