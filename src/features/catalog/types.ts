export type Product = {
  id: string;
  sku?: string | null;
  name: string;
  slug?: string | null;
  brand?: string | null;
  brand_id?: string | null;
  category?: string | null;
  price: number;
  oldPrice?: number | null;
  old_price?: number | null;
  stock?: number;
  available?: number;
  img?: string | null;
  img_variants?: Array<{
    url?: string | null;
    width?: number | null;
    format?: string | null;
  }>;
  imageUrl?: string | null;
  images?: string[];
  description?: string | null;
  specs?: Record<string, unknown>;
  state?: string;
  status?: string | string[];
  [key: string]: unknown;
};

function imageUrl(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Keep the original image first so a known-good supplier/public URL is not
 * replaced by a generated variant. If it fails, ProductCard can walk through
 * the responsive variants and gallery images before showing the logo.
 */
export const productImageCandidates = (product: Product) => {
  const variants = Array.isArray(product.img_variants)
    ? [...product.img_variants]
        .sort((a, b) => Number(b?.width || 0) - Number(a?.width || 0))
        .map((variant) => imageUrl(variant?.url))
    : [];
  return [
    imageUrl(product.img),
    imageUrl(product.imageUrl),
    imageUrl((product as Record<string, unknown>).image_url),
    imageUrl((product as Record<string, unknown>).image),
    ...variants,
    ...(Array.isArray(product.images) ? product.images.map(imageUrl) : []),
    '/legacy-assets/logo.png',
  ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
};

/** Same photo, different address: drop our own origin and any query string. */
function photoKey(url: string) {
  return url
    .replace(/^https?:\/\/(?:www\.)?jayxtsk\.shop(?=\/)/i, '')
    .replace(/\?.*$/, '')
    .toLowerCase();
}

/**
 * Distinct photos for the product page gallery. `img_variants` are renditions
 * of the main image (w240/w480/w960 in avif and webp), not extra photos, so
 * listing them made one picture repeat across the thumbnail rail. They are
 * used only when there is no main image, and then just the largest one.
 * ProductCard keeps using productImageCandidates, whose job is a fallback chain.
 */
export const productGalleryImages = (product: Product) => {
  const record = product as Record<string, unknown>;
  const photos = [
    imageUrl(product.img),
    imageUrl(product.imageUrl),
    imageUrl(record.image_url),
    ...(Array.isArray(product.images) ? product.images.map(imageUrl) : []),
  ].filter(Boolean);
  if (!photos.length) {
    const largest = [...(product.img_variants || [])]
      .filter((variant) => imageUrl(variant?.url))
      .sort((a, b) => Number(b?.width || 0) - Number(a?.width || 0))[0];
    const fallback = imageUrl(largest?.url) || imageUrl(record.image);
    if (fallback) photos.push(fallback);
  }
  const seen = new Set<string>();
  const distinct = photos.filter((url) => {
    const key = photoKey(url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return distinct.length ? distinct : ['/legacy-assets/logo.png'];
};

/**
 * Pictures for small product cards, best first: the smallest rendition at least
 * `minWidth` wide (webp, then avif) so a grid does not download full originals,
 * followed by the usual fallback chain. On a failed load the card walks down it.
 */
export const productCardImages = (product: Product, minWidth = 480) => {
  const variants = (product.img_variants || [])
    .map((variant) => ({
      url: imageUrl(variant?.url),
      width: Number(variant?.width || 0),
      format: String(variant?.format || '').toLowerCase(),
    }))
    .filter((variant) => variant.url && variant.width >= minWidth)
    .sort((a, b) => a.width - b.width || (a.format === 'webp' ? -1 : b.format === 'webp' ? 1 : 0));
  const light = variants.find((variant) => variant.format === 'webp') || variants[0];
  const chain = [light?.url || '', ...productImageCandidates(product)];
  return chain.filter((value, index) => Boolean(value) && chain.indexOf(value) === index);
};

export const productImage = (product: Product) =>
  productImageCandidates(product)[0] || '/legacy-assets/logo.png';
export const productOldPrice = (product: Product) => Number(product.oldPrice ?? product.old_price ?? 0) || 0;
export const productHref = (product: Product) =>
  `/products/${encodeURIComponent(String(product.slug || product.id))}`;
