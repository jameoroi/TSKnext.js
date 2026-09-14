export interface CatalogProduct {
  id: string;
  name: string;
  brand?: string;
  price?: number;
  img?: string;
  image?: string;
  sku?: string;
  barcode?: string;
  variant_label?: string;
  stock?: number;
  state?: string;
  status?: string[];
  variants?: Array<{
    id?: string;
    label?: string;
    sku?: string;
    price?: number;
    stock?: number;
    state?: string;
  }>;
}

export interface CatalogBrand {
  id: string;
  name: string;
  logo_url?: string | null;
  logo_data_url?: string | null;
  img?: string | null;
  active?: boolean;
}

export interface ProductsListResponse {
  ok?: boolean;
  products?: CatalogProduct[];
  total?: number;
  page?: number;
  per_page?: number;
  facets?: Record<string, unknown>;
  error?: string;
}

export interface ProductGetResponse {
  ok?: boolean;
  product?: CatalogProduct | null;
  error?: string;
}

export interface BrandsListResponse {
  ok?: boolean;
  brands?: CatalogBrand[];
  error?: string;
}
