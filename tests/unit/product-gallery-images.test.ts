import { describe, expect, it } from 'vitest';
import { type Product, productGalleryImages, productImageCandidates } from '@/features/catalog/types';

const base = { id: 'p1', name: 'DEWALT DW4811', price: 269 } satisfies Product;
const main = 'https://jayxtsk.shop/media/product/2026/09/618484ba-260845010248fdqgjzbg1_0.webp';

describe('productGalleryImages', () => {
  it('does not repeat the main photo for each of its renditions', () => {
    const product: Product = {
      ...base,
      img: main,
      img_variants: [
        { url: '/media/product/2026/09/b4d7943b-w240.avif', width: 240, format: 'avif' },
        { url: '/media/product/2026/09/91d6a637-w240.webp', width: 240, format: 'webp' },
        { url: '/media/product/2026/09/ad8278f4-w480.avif', width: 480, format: 'avif' },
        { url: '/media/product/2026/09/e8866d06-w480.webp', width: 480, format: 'webp' },
        { url: '/media/product/2026/09/0f6ad6ca-w960.avif', width: 960, format: 'avif' },
        { url: '/media/product/2026/09/c8f310d7-w960.webp', width: 960, format: 'webp' },
      ],
    };
    expect(productGalleryImages(product)).toEqual([main]);
    // The card fallback chain is unchanged and still walks the renditions.
    expect(productImageCandidates(product).length).toBeGreaterThan(6);
  });

  it('treats the same photo on our own origin, a relative path or with a query as one', () => {
    const product: Product = {
      ...base,
      img: main,
      imageUrl: '/media/product/2026/09/618484ba-260845010248fdqgjzbg1_0.webp?v=2',
      images: ['https://www.jayxtsk.shop/media/product/2026/09/618484ba-260845010248fdqgjzbg1_0.webp'],
    };
    expect(productGalleryImages(product)).toEqual([main]);
  });

  it('keeps every distinct photo, main image first', () => {
    const product: Product = {
      ...base,
      img: main,
      images: ['/media/product/2026/09/side.webp', main, '/media/product/2026/09/box.webp'],
    };
    expect(productGalleryImages(product)).toEqual([
      main,
      '/media/product/2026/09/side.webp',
      '/media/product/2026/09/box.webp',
    ]);
  });

  it('falls back to the largest rendition when there is no main image', () => {
    const product: Product = {
      ...base,
      img_variants: [
        { url: '/media/a-w240.webp', width: 240 },
        { url: '/media/a-w960.webp', width: 960 },
        { url: '/media/a-w480.webp', width: 480 },
      ],
    };
    expect(productGalleryImages(product)).toEqual(['/media/a-w960.webp']);
  });

  it('shows the logo when the product has no image at all', () => {
    expect(productGalleryImages({ ...base })).toEqual(['/legacy-assets/logo.png']);
  });
});
