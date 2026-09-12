'use client';

import { useQuery } from '@tanstack/react-query';
import { Heart, Scale, ShoppingCart, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { ProductCard } from '@/components/commerce/product-card';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCartStore } from '@/features/cart/store';
import type { Product } from '@/features/catalog/types';
import { useCompareStore } from '@/features/customer/local-store';
import { useWishlist } from '@/features/customer/wishlist';
import { legacyRequest } from '@/lib/legacy-api.client';

export function SavedProducts({ mode }: { mode: 'wishlist' | 'compare' }) {
  const wishlist = useWishlist();
  const compare = useCompareStore();
  const add = useCartStore((state) => state.add);
  const ids = mode === 'wishlist' ? wishlist.ids : compare.ids;

  const guestProducts = useQuery({
    queryKey: ['saved-products', mode, ids.join(',')],
    queryFn: async () => {
      const rows = await Promise.all(ids.slice(0, 50).map((id) =>
        legacyRequest<{ product?: Product }>('products.get', { id, slug: id }).catch(() => ({ product: undefined })),
      ));
      return rows.map((row) => row.product).filter(Boolean) as Product[];
    },
    enabled: ids.length > 0 && (mode === 'compare' || !wishlist.signedIn),
  });

  const products = mode === 'wishlist' && wishlist.signedIn
    ? (wishlist.products || []) as Product[]
    : (guestProducts.data || []);
  const loading = mode === 'wishlist' ? !wishlist.ready : guestProducts.isPending && ids.length > 0;

  function addAllToCart() {
    for (const product of products) {
      const variants = Array.isArray((product as any).variants)
        ? (product as any).variants.filter((variant: any) => variant?.state !== 'hidden' && variant?.state !== 'discontinued')
        : [];
      if (variants.length > 1) continue; // a human must choose the variant
      const variantId = variants.length === 1 ? String(variants[0]?.id || '') : '';
      const stock = Number(variants[0]?.available ?? variants[0]?.stock ?? product.available ?? product.stock ?? 1);
      if (stock > 0) add(product, 1, variantId);
    }
  }

  return <div className="mx-auto max-w-7xl px-4 py-10 lg:px-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          {mode === 'wishlist' ? <Heart className="text-emerald-800" /> : <Scale className="text-emerald-800" />}
          <h1 className="text-3xl font-bold">{mode === 'wishlist' ? 'รายการโปรด' : 'เปรียบเทียบสินค้า'}</h1>
        </div>
        {mode === 'wishlist' && !wishlist.signedIn && <p className="mt-2 text-sm text-slate-500">บันทึกไว้ในเครื่องนี้ · <Link className="font-semibold text-emerald-800 underline" href="/login?redirect=%2Fwishlist">เข้าสู่ระบบ</Link> เพื่อใช้รายการโปรดข้ามอุปกรณ์</p>}
        {mode === 'wishlist' && wishlist.signedIn && <p className="mt-2 text-sm text-slate-500">ซิงก์กับบัญชีของคุณ ใช้รายการนี้ได้ทุกอุปกรณ์</p>}
        {mode === 'compare' && <p className="mt-2 text-sm text-slate-500">รายการเปรียบเทียบเก็บบนอุปกรณ์นี้ สูงสุด 12 รายการ</p>}
      </div>
      <div className="flex gap-2">
        {products.length > 0 && <Button variant="outline" onClick={addAllToCart}><ShoppingCart size={17}/>เพิ่มสินค้าที่พร้อมขายลงตะกร้า</Button>}
        {mode === 'compare' && ids.length > 0 && <Button variant="outline" onClick={compare.clear}><Trash2 size={17}/>ล้างรายการ</Button>}
      </div>
    </div>

    {loading
      ? <div className="mt-8 rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">กำลังโหลดรายการ…</div>
      : products.length === 0
        ? <div className="mt-8 rounded-2xl border border-dashed bg-white p-10 text-center"><p className="text-slate-500">ยังไม่มีสินค้าในรายการ</p><Link className={`${buttonVariants()} mt-4`} href="/products">เลือกดูสินค้า</Link></div>
        : <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{products.map((product) => <ProductCard key={product.id} product={product}/>)}</div>}
  </div>;
}
