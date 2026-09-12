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
  imageUrl?: string | null;
  images?: string[];
  description?: string | null;
  specs?: Record<string, unknown>;
  state?: string;
  status?: string | string[];
  [key: string]: unknown;
};

export const productImage = (product: Product) => String(product.img || product.imageUrl || product.images?.[0] || '/legacy-assets/logo.png');
export const productOldPrice = (product: Product) => Number(product.oldPrice ?? product.old_price ?? 0) || 0;
export const productHref = (product: Product) => `/products/${encodeURIComponent(String(product.slug || product.id))}`;
