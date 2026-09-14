'use client';

import { ArrowUp, Heart, Home, PackageSearch, Scale, ShoppingCart, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useCartStore } from '@/features/cart/store';
import { useCompareStore } from '@/features/customer/local-store';
import { readRecentProducts } from '@/features/customer/recent-products';
import { useWishlist } from '@/features/customer/wishlist';

export function StorefrontChrome() {
  const pathname = usePathname();
  const cartCount = useCartStore((state) => state.items.reduce((sum, item) => sum + item.qty, 0));
  const addToCart = useCartStore((state) => state.add);
  const compare = useCompareStore();
  const wishlist = useWishlist();
  const [showTop, setShowTop] = useState(false);
  const [recentDismissed, setRecentDismissed] = useState(false);
  const [recent, setRecent] = useState<any>(null);

  useEffect(() => {
    compare.hydrate();
  }, [compare]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const load = () => setRecent(readRecentProducts()[0] || null);
    load();
    window.addEventListener('tsk:recent-products-change', load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener('tsk:recent-products-change', load);
      window.removeEventListener('storage', load);
    };
  }, []);

  useEffect(() => {
    setRecentDismissed(false);
  }, [pathname]);

  const recentHidden = useMemo(
    () =>
      ['/products/', '/cart', '/checkout', '/admin', '/partner', '/account', '/login'].some((prefix) =>
        pathname.startsWith(prefix),
      ),
    [pathname],
  );
  const showRecent = Boolean(recent && !recentDismissed && !recentHidden);

  return (
    <>
      <nav
        className="storefront-dock fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-5 border-t bg-white/95 shadow-[0_-8px_30px_rgba(15,23,42,.08)] backdrop-blur md:hidden"
        aria-label="เมนูลัด"
      >
        <Dock href="/" icon={<Home size={19} />} label="หน้าหลัก" />
        <Dock href="/products" icon={<PackageSearch size={19} />} label="สินค้า" />
        <Dock href="/wishlist" icon={<Heart size={19} />} label="รายการโปรด" badge={wishlist.count} />
        <Dock href="/cart" icon={<ShoppingCart size={19} />} label="ตะกร้า" badge={cartCount} />
        <Dock href="/account" icon={<UserRound size={19} />} label="บัญชี" />
      </nav>

      {compare.ids.length > 0 && (
        <aside
          className={`fixed right-4 z-50 flex items-center gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-xl ${showRecent ? 'bottom-[17rem] md:bottom-48' : 'bottom-[11.5rem] md:bottom-28'}`}
          aria-label="รายการเปรียบเทียบ"
        >
          <Scale size={17} />
          <span>เปรียบเทียบ {compare.ids.length}/4</span>
          <Link href="/compare" className="rounded-lg bg-white px-3 py-1.5 text-xs text-slate-950">
            ดูรายการ
          </Link>
          <button
            type="button"
            onClick={compare.clear}
            className="text-white/70 hover:text-white"
            aria-label="ล้างรายการเปรียบเทียบ"
          >
            <X size={17} />
          </button>
        </aside>
      )}

      {showRecent && (
        <aside className="fixed inset-x-3 bottom-[12rem] z-40 mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border bg-white p-2.5 shadow-xl md:bottom-28">
          <Link
            href={`/products/${encodeURIComponent(String(recent.id))}`}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <img
              src={String(recent.img || recent.imageUrl || recent.image_url || '/legacy-assets/logo.png')}
              alt=""
              className="size-11 shrink-0 rounded-xl bg-slate-50 object-contain p-1"
            />
            <span className="min-w-0">
              <small className="block text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                สินค้าที่เพิ่งดู
              </small>
              <b className="block truncate text-sm">{String(recent.name || '')}</b>
            </span>
            <strong className="ml-auto shrink-0 text-sm text-emerald-950">
              ฿{Number(recent.price || 0).toLocaleString('th-TH')}
            </strong>
          </Link>
          <button
            type="button"
            onClick={() =>
              addToCart(
                {
                  id: String(recent.id),
                  name: String(recent.name || ''),
                  price: Number(recent.price || 0),
                  brand: String(recent.brand || ''),
                  img: String(recent.img || recent.imageUrl || recent.image_url || ''),
                } as any,
                1,
              )
            }
            className="hidden shrink-0 rounded-xl bg-emerald-900 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 sm:inline-flex"
          >
            สั่งซื้อ
          </button>
          <button
            type="button"
            onClick={() => setRecentDismissed(true)}
            className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-slate-100"
            aria-label="ปิด"
          >
            <X size={16} />
          </button>
        </aside>
      )}

      {showTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="back-to-top show fixed bottom-20 left-4 z-30 grid size-11 place-items-center rounded-full border bg-white text-emerald-950 shadow-lg md:bottom-5"
          aria-label="กลับขึ้นด้านบน"
        >
          <ArrowUp size={18} />
        </button>
      )}
    </>
  );
}

function Dock({
  href,
  icon,
  label,
  badge = 0,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="relative grid place-items-center content-center gap-1 text-[10px] font-semibold text-slate-600 hover:text-emerald-800"
    >
      <span className="relative">
        {icon}
        {badge > 0 && (
          <i className="absolute -right-2 -top-2 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[9px] not-italic leading-4 text-white">
            {badge > 99 ? '99+' : badge}
          </i>
        )}
      </span>
      {label}
    </Link>
  );
}
