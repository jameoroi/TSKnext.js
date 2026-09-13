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

export const productImage = (product: Product) => productImageCandidates(product)[0] || '/legacy-assets/logo.png';
export const productOldPrice = (product: Product) => Number(product.oldPrice ?? product.old_price ?? 0) || 0;
export const productHref = (product: Product) => `/products/${encodeURIComponent(String(product.slug || product.id))}`;
