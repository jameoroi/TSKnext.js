import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { ProductCard } from '@/components/commerce/product-card';
import { ProductDetailActions } from '@/components/commerce/product-detail-actions';
import { ProductGallery } from '@/components/commerce/product-gallery';
import { ProductInfoTabs } from '@/components/commerce/product-info-tabs';
import { RecentlyViewed } from '@/components/customer/recently-viewed';
import { type Product, productHref, productImage } from '@/features/catalog/types';
import { getLegacySession } from '@/server/auth/legacy-session';
import { getProduct, getProducts } from '@/server/catalog';
import { requestOrigin } from '@/server/public-legacy-cache';
import { safeLegacy } from '@/server/safe-legacy';

type Props = { params: Promise<{ id: string }> };

// Thai slugs can arrive still percent-encoded (dewalt-%E0%B8%9B...), which the
// catalogue lookup cannot match, so those product links rendered "not found"
// while the same product opened fine by its ASCII id.
function routeParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function seoDescription(product: Product) {
  const written = String(product.description || (product as any).desc || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (written.length >= 60) return written.slice(0, 300);
  const parts = [
    product.name,
    product.brand ? `แบรนด์ ${product.brand}` : '',
    product.category ? `หมวด ${product.category}` : '',
    Number(product.price || 0) > 0 ? `ราคา ${Number(product.price).toLocaleString('th-TH')} บาท` : '',
    Number(product.available ?? product.stock ?? 1) <= 0 ? 'สินค้าหมดชั่วคราว' : 'พร้อมส่ง',
    'สั่งซื้อออนไลน์กับ THAISERKIT SUPPLY ส่งทั่วไทย',
  ].filter(Boolean);
  return parts.join(' · ').slice(0, 300);
}

function absoluteUrl(origin: string, value: unknown) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('data:')) return '';
  try {
    return new URL(raw, origin).toString();
  } catch {
    return '';
  }
}

function liveVariants(product: Product) {
  return (Array.isArray((product as any).variants) ? (product as any).variants : []).filter(
    (row: any) => row?.state !== 'hidden' && row?.state !== 'discontinued',
  );
}

function productPriceRange(product: Product) {
  const variants = liveVariants(product);
  const prices = [
    Number(product.price || 0),
    ...variants.map((row: any) => Number(row?.price ?? product.price ?? 0)),
  ].filter((price) => Number.isFinite(price) && price > 0);
  if (!prices.length) return { low: 0, high: 0, count: Math.max(1, variants.length) };
  return { low: Math.min(...prices), high: Math.max(...prices), count: Math.max(1, variants.length) };
}

function productInStock(product: Product) {
  const variants = liveVariants(product);
  if (variants.length) return variants.some((row: any) => Number(row?.available ?? row?.stock ?? 1) > 0);
  return Number(product.available ?? product.stock ?? 1) > 0;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = routeParam((await params).id);
  const [payload, origin] = await Promise.all([getProduct(id), requestOrigin()]);
  if (!payload.product) return { title: 'ไม่พบสินค้า', robots: { index: false, follow: false } };
  const product = payload.product;
  const canonical = absoluteUrl(origin, productHref(product));
  const image = absoluteUrl(origin, productImage(product));
  const range = productPriceRange(product);
  return {
    title: product.name,
    description: seoDescription(product),
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title: product.name,
      description: seoDescription(product),
      url: canonical,
      images: image ? [{ url: image, alt: product.name }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      description: seoDescription(product),
      images: image ? [image] : undefined,
    },
    other: {
      'product:price:amount': String(range.low || Number(product.price || 0)),
      'product:price:currency': 'THB',
      'product:availability': productInStock(product) ? 'in stock' : 'out of stock',
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const id = routeParam((await params).id);
  const [payload, origin] = await Promise.all([getProduct(id), requestOrigin()]);
  if (payload.error === 'moved' && payload.moved_to)
    permanentRedirect(`/products/${encodeURIComponent(payload.moved_to)}`);
  const product = payload.product;
  if (!product) {
    // Storage or quota failures must not tell shoppers the product is gone.
    if (payload.error === 'unavailable') throw new Error('product_unavailable');
    notFound();
  }

  const [recommendations, session, reviewSummary] = await Promise.all([
    safeLegacy<any>('products.recommend', { id: product.id, limit: 8 }, { recommendations: [] }),
    getLegacySession(),
    safeLegacy<{ average?: number; count?: number }>(
      'reviews.list',
      { product_id: product.id },
      { average: 0, count: 0 },
    ),
  ]);
  const reviewCount = Number(reviewSummary?.count || 0);
  const ratingValue = Number(reviewSummary?.average || 0);
  let related: Product[] = Array.isArray(recommendations.recommendations)
    ? recommendations.recommendations
        .map((row: any) => row?.product)
        .filter(Boolean)
        .slice(0, 6)
    : [];
  if (!related.length)
    related = (await getProducts({ brand: product.brand || '', per_page: 8 })).products
      .filter((row) => row.id !== product.id)
      .slice(0, 6);

  const canonical = absoluteUrl(origin, productHref(product));
  const images = [productImage(product), ...(Array.isArray(product.images) ? product.images : [])]
    .map((image) => absoluteUrl(origin, image))
    .filter(Boolean);
  const range = productPriceRange(product);
  const availability = productInStock(product)
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock';
  const seller = { '@id': `${origin.replace(/\/$/, '')}/#business` };
  const offers =
    range.high > range.low
      ? {
          '@type': 'AggregateOffer',
          priceCurrency: 'THB',
          lowPrice: range.low,
          highPrice: range.high,
          offerCount: range.count,
          availability,
          url: canonical,
          seller,
        }
      : {
          '@type': 'Offer',
          priceCurrency: 'THB',
          price: range.low || Number(product.price || 0),
          availability,
          itemCondition: 'https://schema.org/NewCondition',
          url: canonical,
          seller,
        };
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: images,
    description: seoDescription(product),
    url: canonical,
    sku: product.sku || undefined,
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    category: product.category || undefined,
    offers,
    // Only real, approved reviews: Google ignores (and may penalise) ratings without them.
    aggregateRating:
      reviewCount > 0 && ratingValue > 0
        ? {
            '@type': 'AggregateRating',
            ratingValue: Number(ratingValue.toFixed(1)),
            reviewCount,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'หน้าแรก', item: origin },
      { '@type': 'ListItem', position: 2, name: 'สินค้าทั้งหมด', item: `${origin.replace(/\/$/, '')}/products` },
      { '@type': 'ListItem', position: 3, name: product.name, item: canonical },
    ],
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-6 lg:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }}
      />
      <nav className="mb-6 flex flex-wrap items-center gap-1 text-sm text-slate-500">
        <Link href="/">หน้าแรก</Link>
        <span>›</span>
        <Link href="/products">สินค้า</Link>
        {product.category && (
          <>
            <span>›</span>
            <Link href={`/products?category=${encodeURIComponent(String(product.category))}`}>
              {String(product.category)}
            </Link>
          </>
        )}
        <span>›</span>
        <span className="line-clamp-1 text-slate-700">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,.98fr)] lg:gap-10">
        <ProductGallery product={product} />
        <section className="self-start lg:sticky lg:top-24">
          <p className="text-sm font-black uppercase tracking-wide text-emerald-700">
            {product.brand || 'THAISERKIT'}
          </p>
          <h1 className="mt-2 text-3xl font-black leading-tight text-slate-950 lg:text-4xl">
            {product.name}
          </h1>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
            {product.sku && <span>SKU: {String(product.sku)}</span>}
            {(product as any).model && <span>รุ่น: {String((product as any).model)}</span>}
            {product.category && <span>หมวด: {String(product.category)}</span>}
          </div>
          <div className="my-6 border-t" />
          <ProductDetailActions product={product} />
        </section>
      </div>

      <ProductInfoTabs
        product={product}
        canReview={Boolean(session.customer)}
        csrf={String(session.csrf || '')}
      />

      {related.length > 0 && (
        <section className="mt-12">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Recommended</p>
              <h2 className="mt-1 text-2xl font-black">สินค้าที่เกี่ยวข้อง</h2>
            </div>
            <Link href="/products" className="text-sm font-bold text-emerald-800 tsk-link">
              ดูสินค้าทั้งหมด
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
            {related.map((row) => (
              <ProductCard key={row.id} product={row} />
            ))}
          </div>
        </section>
      )}

      <RecentlyViewed excludeId={String(product.id)} />
    </main>
  );
}
