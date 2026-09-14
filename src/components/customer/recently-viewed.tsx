'use client';

import { useEffect, useState } from 'react';
import { ProductCard } from '@/components/commerce/product-card';
import type { Product } from '@/features/catalog/types';
import { readRecentProducts } from '@/features/customer/recent-products';

export function RecentlyViewed({ excludeId = '' }: { excludeId?: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => {
    const load = () =>
      setProducts(
        readRecentProducts()
          .filter((row) => String(row.id) !== String(excludeId))
          .slice(0, 6),
      );
    load();
    window.addEventListener('storage', load);
    window.addEventListener('tsk:recent-products-change', load);
    return () => {
      window.removeEventListener('storage', load);
      window.removeEventListener('tsk:recent-products-change', load);
    };
  }, [excludeId]);
  if (!products.length) return null;
  return (
    <section className="mt-12">
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Recently viewed</p>
        <h2 className="mt-1 text-2xl font-black">สินค้าที่ดูล่าสุด</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {products.map((product) => (
          <ProductCard key={String(product.id)} product={product} />
        ))}
      </div>
    </section>
  );
}
