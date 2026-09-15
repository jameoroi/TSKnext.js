'use client';

import type { ImageLoaderProps } from 'next/image';

// Product photos are stored in our R2 bucket and served by /media/<key>.
// Sending those through /_next/image made the Worker fetch its own custom
// domain, which Cloudflare rejects with 522, so product cards rendered empty.
// Own media is served straight from /media (immutable, edge-cacheable) and
// every other source keeps the built-in optimizer.
const OWN_MEDIA = /^(?:https:\/\/(?:www\.)?jayxtsk\.shop)?\/media\/(.+)$/i;

export default function imageLoader({ src, width, quality }: ImageLoaderProps) {
  if (src.startsWith('data:') || src.startsWith('blob:')) return src;
  const own = src.match(OWN_MEDIA);
  if (own) return `/media/${own[1]}`;
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality || 75}`;
}
