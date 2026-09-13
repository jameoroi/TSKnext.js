'use client';

import { useState } from 'react';

export function BrandLogo({ src, name, className = '' }: { src: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(!src);
  if (failed)
    return <span className={`text-sm font-black tracking-wide text-slate-800 ${className}`}>{name}</span>;

  return (
    // biome-ignore lint/performance/noImgElement: CMS stores arbitrary CDN/data URLs.
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className={className || 'max-h-12 w-auto max-w-full object-contain'}
      onError={() => setFailed(true)}
    />
  );
}
