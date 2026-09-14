'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { type Product, productImageCandidates } from '@/features/catalog/types';

function uniqueImages(product: Product) {
  return productImageCandidates(product);
}

export function ProductGallery({ product }: { product: Product }) {
  const images = useMemo(() => uniqueImages(product), [product]);
  const [active, setActive] = useState(images[0] || '/legacy-assets/logo.png');
  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-3xl border bg-white shadow-sm">
        <Image
          src={active}
          alt={product.name}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-contain p-6 sm:p-10"
          unoptimized
        />
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              onClick={() => setActive(image)}
              className={`relative size-20 shrink-0 overflow-hidden rounded-xl border bg-white ${active === image ? 'ring-2 ring-emerald-700 ring-offset-1' : ''}`}
              aria-label={`ดูรูปที่ ${index + 1}`}
            >
              <Image
                src={image}
                alt={`${product.name} ${index + 1}`}
                fill
                sizes="80px"
                className="object-contain p-1"
                unoptimized
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
