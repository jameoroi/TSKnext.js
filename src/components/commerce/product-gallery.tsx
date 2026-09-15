'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { type Product, productImageCandidates } from '@/features/catalog/types';
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

function uniqueImages(product: Product) {
  return productImageCandidates(product);
}

// Large enough to stay sharp at 2.5x over a ~600px preview.
const zoomSource = (src: string) => imageLoader({ src, width: 1920, quality: 90 });

export function ProductGallery({ product }: { product: Product }) {
  const images = useMemo(() => uniqueImages(product), [product]);
  const [active, setActive] = useState(images[0] || '/legacy-assets/logo.png');
  const [fullView, setFullView] = useState(false);

  // The Lit element touches HTMLElement, which Workers SSR does not have, so it
  // is only loaded in the browser. Until then <tsk-image-zoom> is a plain box.
  useEffect(() => {
    void import('./tsk-image-zoom');
  }, []);

  const thumbnails =
    images.length > 1
      ? images.map((image, index) => (
          <button
            key={`${image}-${index}`}
            type="button"
            onClick={() => setActive(image)}
            onMouseEnter={() => setActive(image)}
            className={`relative size-16 shrink-0 overflow-hidden rounded-xl border bg-white lg:size-[4.25rem] ${active === image ? 'ring-2 ring-emerald-700 ring-offset-1' : 'hover:border-slate-400'}`}
            aria-label={`ดูรูปที่ ${index + 1}`}
            aria-pressed={active === image}
          >
            <Image
              src={image}
              alt={`${product.name} ${index + 1}`}
              fill
              sizes="72px"
              className="object-contain p-1"
              unoptimized={image.startsWith('data:')}
            />
          </button>
        ))
      : null;

  return (
    <div className="lg:grid lg:grid-cols-[4.25rem_minmax(0,1fr)] lg:gap-4">
      {thumbnails && (
        <div className="order-2 mt-3 flex gap-2 overflow-x-auto pb-1 lg:order-none lg:mt-0 lg:max-h-[36rem] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:p-1">
          {thumbnails}
        </div>
      )}
      <div>
        <div className="relative aspect-square rounded-3xl border bg-white p-6 shadow-sm sm:p-10">
          <button
            type="button"
            onClick={() => setFullView(true)}
            className="block size-full cursor-zoom-in rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700"
            aria-label={`ดูภาพ ${product.name} แบบเต็ม`}
          >
            <tsk-image-zoom
              zoom-src={zoomSource(active)}
              zoom={2.5}
              // The pane starts past the frame's padding (sm:p-10) plus a 1.5rem gap.
              style={{ '--tsk-zoom-gap': '4rem' } as React.CSSProperties}
            >
              <span className="relative block size-full">
                <Image
                  src={active}
                  alt={product.name}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-contain"
                  unoptimized={active.startsWith('data:')}
                />
              </span>
            </tsk-image-zoom>
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-slate-500">
          <span className="hidden lg:inline">วางเมาส์บนรูปเพื่อซูม · คลิกเพื่อดูภาพเต็ม</span>
          <span className="lg:hidden">แตะรูปเพื่อดูภาพเต็ม</span>
        </p>
      </div>

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
          {thumbnails && <div className="flex justify-center gap-2 overflow-x-auto pb-1">{thumbnails}</div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
