import { describe, expect, it } from 'vitest';
import imageLoader from '@/lib/image-loader';

describe('imageLoader', () => {
  it('serves absolute own-domain media straight from /media', () => {
    expect(
      imageLoader({ src: 'https://jayxtsk.shop/media/product/2026/09/a-b_0.webp', width: 384, quality: 75 }),
    ).toBe('/media/product/2026/09/a-b_0.webp');
    expect(imageLoader({ src: 'https://www.jayxtsk.shop/media/site/x.png', width: 640 })).toBe(
      '/media/site/x.png',
    );
  });

  it('serves relative media paths straight from /media', () => {
    expect(imageLoader({ src: '/media/brand/logo.png', width: 256 })).toBe('/media/brand/logo.png');
  });

  it('keeps the built-in optimizer for other hosts and local assets', () => {
    expect(
      imageLoader({
        src: 'https://pub-b871fe11a2c745bd94b2677aa5027138.r2.dev/a.webp',
        width: 640,
        quality: 80,
      }),
    ).toBe('/_next/image?url=https%3A%2F%2Fpub-b871fe11a2c745bd94b2677aa5027138.r2.dev%2Fa.webp&w=640&q=80');
    expect(imageLoader({ src: '/legacy-assets/logo.png', width: 256 })).toBe(
      '/_next/image?url=%2Flegacy-assets%2Flogo.png&w=256&q=75',
    );
  });

  it('does not treat look-alike hosts as own media', () => {
    expect(imageLoader({ src: 'https://jayxtsk.shop.evil.test/media/a.png', width: 256 })).toMatch(
      /^\/_next\/image\?url=/,
    );
  });

  it('passes inline images through unchanged', () => {
    expect(imageLoader({ src: 'data:image/png;base64,AAAA', width: 16 })).toBe('data:image/png;base64,AAAA');
  });
});
