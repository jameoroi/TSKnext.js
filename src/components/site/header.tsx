'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Heart,
  Menu,
  Search,
  ShoppingCart,
  UserRound,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthModalStore } from '@/features/auth/modal-store';
import { useCartStore } from '@/features/cart/store';
import { type Product, productHref, productImage } from '@/features/catalog/types';
import { useCompareStore } from '@/features/customer/local-store';
import { useWishlist } from '@/features/customer/wishlist';
import { legacyRequest } from '@/lib/legacy-api.client';
import { trackMarketing } from '@/lib/marketing.client';
import { FALLBACK_CATEGORIES, subcategoriesForKey } from '@/shared/categories';
import { CategoryIcon } from './category-icon';
import { ThemeToggle } from './theme-toggle';

const SEARCH_KEY = 'tsk-recent-searches';
const NEXT_OLD_SEARCH_KEY = 'tsk_recent_searches';
const POPULAR = ['Milwaukee', 'DeWalt', 'ปั๊มน้ำ', 'สว่านไร้สาย', 'เครื่องตัดหญ้า', 'เครื่องฉีดน้ำ', 'Makita', 'Pumpkin'];

function HeaderLogo({ src }: { src: string }) {
  return (
    <Image
      src={src}
      alt="THAISERKIT SUPPLY"
      width={140}
      height={44}
      className="h-10 w-auto object-contain"
      priority
      unoptimized={src.startsWith('data:') || src.startsWith('/api')}
    />
  );
}

function NavLink({
  href,
  active,
  hot,
  children,
}: {
  href: string;
  active?: boolean;
  hot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`nav-link whitespace-nowrap px-3 py-3 text-sm font-semibold transition-colors ${
        active
          ? 'is-active text-emerald-800'
          : hot
            ? 'text-rose-700 hover:text-rose-800'
            : 'text-slate-700 hover:text-emerald-800'
      }`}
    >
      {children}
    </Link>
  );
}

function PromoLink() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = pathname === '/products' && (searchParams.get('status') || '') !== '';
  return (
    <NavLink href="/products?status=สินค้าลดราคา" hot active={active}>
      โปรโมชั่น
    </NavLink>
  );
}

type CatRow = { key: string; name: string; icon?: string | null };

function CatMenu({
  categories,
  open,
  activeKey,
  onOpenChange,
  onActiveChange,
  closeTimer,
}: {
  categories: CatRow[];
  open: boolean;
  activeKey: string;
  onOpenChange: (v: boolean) => void;
  onActiveChange: (key: string) => void;
  closeTimer: React.MutableRefObject<number | null>;
}) {
  const rows = categories.map((c: any) => ({
    key: String(c.key || c.id || c.name || ''),
    name: String(c.name || c.key || ''),
    icon: (c.icon as string | null) || null,
  }));
  const current = rows.find((r) => r.key === activeKey) || rows[0];
  const subs = current ? subcategoriesForKey(current.key) : [];

  const scheduleClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => onOpenChange(false), 140);
  };
  const cancelClose = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  return (
    <section
      aria-label="เมนูหมวดหมู่สินค้า"
      className="relative shrink-0"
      onMouseEnter={() => {
        cancelClose();
        onOpenChange(true);
      }}
      onMouseLeave={scheduleClose}
      onFocus={() => {
        cancelClose();
        onOpenChange(true);
      }}
      onBlur={scheduleClose}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => onOpenChange(!open)}
        className={`my-1.5 flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold text-white transition ${
          open ? 'bg-emerald-700' : 'bg-emerald-800 hover:bg-emerald-700'
        }`}
      >
        <Menu className="size-4" />
        หมวดหมู่สินค้า
        <ChevronDown className={`size-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mega-in absolute left-0 top-[calc(100%+8px)] z-[90] w-[min(860px,calc(100vw-2rem))] overflow-hidden rounded-2xl border bg-white shadow-2xl">
          <div className="grid md:grid-cols-[250px_1fr]">
            <ul
              className="max-h-[380px] overflow-y-auto border-r border-slate-100 p-2"
              aria-label="หมวดหมู่สินค้า"
            >
              {rows.map((row) => {
                const active = current?.key === row.key;
                return (
                  <li key={row.key}>
                    <Link
                      href={`/products?category=${encodeURIComponent(row.key)}`}
                      onMouseEnter={() => onActiveChange(row.key)}
                      onFocus={() => onActiveChange(row.key)}
                      onClick={() => onOpenChange(false)}
                      className={`mega-cat flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                        active
                          ? 'bg-emerald-50 font-bold text-emerald-900'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <CategoryIcon
                        icon={row.icon}
                        categoryKey={row.key}
                        className="size-5 shrink-0 text-emerald-700"
                      />
                      <span className="min-w-0 flex-1 truncate">{row.name}</span>
                      <ChevronRight className="size-4 shrink-0 text-slate-300" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="min-w-0 p-5">
              {current ? (
                <>
                  <p className="text-base font-black text-emerald-950">{current.name}</p>
                  {subs.length > 0 ? (
                    <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5 lg:grid-cols-3">
                      {subs.map((sub) => (
                        <Link
                          key={sub.query}
                          href={`/products?category=${encodeURIComponent(current.key)}&q=${encodeURIComponent(sub.query)}`}
                          onClick={() => onOpenChange(false)}
                          className="mega-link truncate text-sm text-slate-600 hover:text-emerald-800"
                        >
                          {sub.label}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-400">ดูสินค้าในหมวดนี้</p>
                  )}
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <Link
                      href={`/products?category=${encodeURIComponent(current.key)}`}
                      onClick={() => onOpenChange(false)}
                      className="text-sm font-bold text-emerald-800 hover:underline"
                    >
                      ดูทั้งหมดในหมวดนี้ →
                    </Link>
                  </div>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-2.5 text-sm">
            <Link
              href="/brands"
              onClick={() => onOpenChange(false)}
              className="font-bold text-slate-600 hover:text-emerald-800"
            >
              แบรนด์ทั้งหมด
            </Link>
            <Link
              href="/products"
              onClick={() => onOpenChange(false)}
              className="font-bold text-emerald-800 hover:underline"
            >
              ดูสินค้าทั้งหมด
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

function rememberSearch(term: string) {
  try {
    const current = JSON.parse(localStorage.getItem(SEARCH_KEY) || '[]');
    const values = Array.isArray(current) ? current.map(String) : [];
    localStorage.setItem(
      SEARCH_KEY,
      JSON.stringify([term, ...values.filter((item) => item !== term)].slice(0, 6)),
    );
  } catch {}
}

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const count = useCartStore((state) => state.items.reduce((total, item) => total + item.qty, 0));
  const wishlist = useWishlist();
  const compare = useCompareStore();
  const showAuth = useAuthModalStore((state) => state.show);
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [headerAway, setHeaderAway] = useState(false);
  const [headerCompact, setHeaderCompact] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [activeCat, setActiveCat] = useState('');
  const catCloseTimer = useRef<number | null>(null);
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => legacyRequest<any>('session'),
    staleTime: 60_000,
    retry: 1,
  });
  const categoriesQuery = useQuery({
    queryKey: ['header.categories'],
    queryFn: () => legacyRequest<any>('categories.list'),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const siteQuery = useQuery({
    queryKey: ['site.settings', 'compact'],
    queryFn: () => legacyRequest<any>('site.settings', { compact: 1 }),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const headerCategories = useMemo(() => {
    const rows = Array.isArray(categoriesQuery.data?.categories) ? categoriesQuery.data.categories : [];
    return (rows.length ? rows : FALLBACK_CATEGORIES).slice(0, 18);
  }, [categoriesQuery.data]);

  useEffect(() => {
    try {
      let raw = localStorage.getItem(SEARCH_KEY);
      if (!raw) {
        raw = localStorage.getItem(NEXT_OLD_SEARCH_KEY);
        if (raw) {
          localStorage.setItem(SEARCH_KEY, raw);
          localStorage.removeItem(NEXT_OLD_SEARCH_KEY);
        }
      }
      const value = JSON.parse(raw || '[]');
      if (Array.isArray(value)) setRecent(value.map(String).slice(0, 6));
    } catch {}
  }, []);

  useEffect(() => {
    if (pathname !== null) {
      setMenuOpen(false);
      setCatOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      setHeaderCompact(y > 90);
      if (y < 160) setHeaderAway(false);
      else if (y - lastY > 7) setHeaderAway(true);
      else if (lastY - y > 7) setHeaderAway(false);
      lastY = y;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setSearchBusy(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchBusy(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        const data = await response.json();
        if (response.ok) setSuggestions(Array.isArray(data.products) ? data.products.slice(0, 6) : []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearchBusy(false);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const account = useMemo(() => {
    const data = session.data || {};
    if (data.admin) return { href: '/admin', label: data.admin_username || 'แอดมิน' };
    if (data.customer)
      return { href: '/account', label: String(data.customer.name || 'บัญชีของฉัน').split(' ')[0] };
    if (data.agent) return { href: '/agent', label: data.agent_profile?.store_name || 'ตัวแทน' };
    if (data.supplier) return { href: '/supplier', label: 'Supplier' };
    return null;
  }, [session.data]);

  function runSearch(termInput = query) {
    const term = termInput.trim();
    if (!term) return;
    rememberSearch(term);
    setRecent((current) => [term, ...current.filter((item) => item !== term)].slice(0, 6));
    setSearchOpen(false);
    trackMarketing('search', { search_term: term });
    router.push(`/products?q=${encodeURIComponent(term)}`);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    runSearch();
  }

  function applySuggestion(term: string) {
    setQuery(term);
    runSearch(term);
  }

  const searchPanel = searchOpen ? (
    <div className="absolute inset-x-0 top-[calc(100%+8px)] z-[80] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      {query.trim().length >= 2 ? (
        <div className="max-h-[370px] overflow-y-auto p-2">
          {searchBusy ? (
            <p className="px-3 py-5 text-center text-sm text-slate-500">กำลังค้นหาสินค้าที่เกี่ยวข้อง…</p>
          ) : suggestions.length ? (
            <>
              {suggestions.map((product) => (
                <Link
                  key={product.id}
                  href={productHref(product)}
                  onClick={() => setSearchOpen(false)}
                  className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-50"
                >
                  <Image
                    src={productImage(product)}
                    alt=""
                    width={54}
                    height={54}
                    className="size-14 rounded-xl bg-slate-50 object-contain p-1"
                    unoptimized={productImage(product).startsWith('data:')}
                  />
                  <span className="min-w-0 flex-1">
                    <strong className="line-clamp-2 text-sm text-slate-900">{product.name}</strong>
                    <small className="block truncate text-xs text-slate-500">
                      {product.brand || product.category || 'สินค้า'}
                    </small>
                  </span>
                  <b className="whitespace-nowrap text-sm text-emerald-900">
                    ฿{Number(product.price || 0).toLocaleString('th-TH')}
                  </b>
                </Link>
              ))}
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runSearch()}
                className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-bold text-emerald-900 hover:bg-emerald-50"
              >
                ดูผลค้นหาทั้งหมดสำหรับ “{query.trim()}”
              </button>
            </>
          ) : (
            <p className="px-3 py-5 text-center text-sm text-slate-500">
              ไม่พบสินค้าที่ตรง ลองถาม AI ให้ช่วยค้นหาและเปรียบเทียบได้
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 p-4">
          {recent.length ? (
            <section>
              <div className="flex items-center justify-between">
                <strong className="text-xs text-slate-700">ค้นหาล่าสุด</strong>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setRecent([]);
                    try {
                      localStorage.removeItem(SEARCH_KEY);
                    } catch {}
                  }}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-700"
                >
                  ล้าง
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {recent.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applySuggestion(item)}
                    className="rounded-full border px-3 py-1.5 text-xs hover:border-emerald-700 hover:text-emerald-800"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <section>
            <strong className="text-xs text-slate-700">คำค้นหายอดนิยม</strong>
            <div className="mt-2 flex flex-wrap gap-2">
              {POPULAR.map((item) => (
                <button
                  key={item}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applySuggestion(item)}
                  className="rounded-full border px-3 py-1.5 text-xs hover:border-emerald-700 hover:text-emerald-800"
                >
                  {item}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  ) : null;

  const announcement = String(
    siteQuery.data?.settings?.announcement ||
      'จัดส่งทั่วประเทศ · สินค้าเครื่องมือและอุปกรณ์อุตสาหกรรม · THAISERKIT SUPPLY',
  );

  return (
    <header
      className={`sticky top-0 z-50 border-b border-emerald-950/10 bg-white/95 backdrop-blur-xl transition-transform duration-300 ${headerAway ? '-translate-y-full' : 'translate-y-0'}`}
    >
      {!headerCompact && (
        <div className="bg-emerald-950 px-4 py-2 text-xs text-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 lg:px-2">
            <div className="flex min-w-0 items-center gap-4">
              <span className="hidden shrink-0 lg:inline">🚚 จัดส่งทั่วไทย 1–3 วัน</span>
              <span className="hidden shrink-0 xl:inline">✓ สินค้าของแท้ 100%</span>
              <span className="hidden shrink-0 xl:inline">↩ คืนสินค้าใน 7 วัน</span>
              <span className="truncate">{announcement}</span>
            </div>
            <nav
              className="hidden shrink-0 items-center gap-4 text-emerald-100/80 md:flex"
              aria-label="ลิงก์ด่วน"
            >
              <a href="tel:0882608042" className="font-bold text-white hover:underline">
                ☎ 088-2608042
              </a>
              <Link href="/track-order" className="hover:text-white">
                ติดตามคำสั่งซื้อ
              </Link>
              <Link href="/contact" className="hover:text-white">
                ติดต่อเรา
              </Link>
              <span className="inline-flex items-center gap-1 text-white" title="ภาษาไทย">
                🇹🇭 TH
              </span>
            </nav>
          </div>
        </div>
      )}
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 lg:px-6">
        <button
          type="button"
          className="grid size-10 place-items-center lg:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="เมนู"
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="THAISERKIT SUPPLY หน้าแรก">
          <HeaderLogo src={String(siteQuery.data?.settings?.logo_url || '/legacy-assets/logo.png')} />
        </Link>
        <form
          onSubmit={submit}
          className="relative hidden min-w-0 flex-1 md:block"
          aria-label="ค้นหาสินค้า"
          onFocus={() => setSearchOpen(true)}
          onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาสินค้า รุ่น แบรนด์ หรือ SKU"
            autoComplete="off"
            aria-label="ค้นหาสินค้า รุ่น แบรนด์ หรือ SKU"
            className="h-11 w-full rounded-full border border-slate-300 bg-slate-50 pl-10 pr-14 text-sm outline-none focus:border-emerald-800"
          />
          <button
            type="submit"
            aria-label="ค้นหา"
            className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-emerald-800 text-white transition hover:bg-emerald-700"
          >
            <Search size={18} />
          </button>
          {searchPanel}
        </form>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Link
            href="/wishlist"
            className="relative hidden items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold hover:bg-slate-100 lg:flex"
            aria-label="รายการโปรด"
          >
            <Heart size={19} />
            <span className="hidden 2xl:inline">รายการโปรด</span>
            {wishlist.count ? (
              <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                {wishlist.count}
              </span>
            ) : null}
          </Link>
          {account ? (
            <Link
              href={account.href}
              className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold hover:bg-slate-100"
              aria-label={account.label}
            >
              <UserRound size={20} />
              <span className="hidden max-w-24 truncate xl:inline">{account.label}</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => showAuth('customer', pathname === '/login' ? '/account' : pathname)}
              className="flex items-center gap-2 whitespace-nowrap rounded-xl px-2.5 py-2 text-xs font-bold hover:bg-slate-100"
              title="เข้าสู่ระบบ / สมัครสมาชิก"
              aria-label="เข้าสู่ระบบ / สมัครสมาชิก"
            >
              <UserRound size={20} />
              <span className="hidden xl:inline">เข้าสู่ระบบ</span>
            </button>
          )}
          <Link
            href="/cart"
            className="relative flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold hover:bg-slate-100"
            aria-label="ตะกร้าสินค้า"
          >
            <ShoppingCart size={20} />
            <span className="hidden 2xl:inline">ตะกร้า</span>
            {count > 0 && (
              <span
                data-cart-count
                className="cart-count absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white"
              >
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>
      <div className="hidden border-t border-slate-100 xl:block">
        <div className="mx-auto flex max-w-7xl items-stretch gap-1 px-4 lg:px-6">
          <CatMenu
            categories={headerCategories}
            open={catOpen}
            activeKey={activeCat}
            onOpenChange={setCatOpen}
            onActiveChange={setActiveCat}
            closeTimer={catCloseTimer}
          />
          <nav className="flex items-center gap-0.5 text-sm font-semibold" aria-label="เมนูหลัก">
            <NavLink href="/" active={pathname === '/'}>
              หน้าแรก
            </NavLink>
            <NavLink href="/products" active={pathname === '/products'}>
              สินค้า
            </NavLink>
            <NavLink href="/brands" active={pathname === '/brands'}>
              แบรนด์
            </NavLink>
            <Suspense
              fallback={
                <NavLink href="/products?status=สินค้าลดราคา" hot active={false}>
                  โปรโมชั่น
                </NavLink>
              }
            >
              <PromoLink />
            </Suspense>
            <NavLink href="/news" active={pathname === '/news'}>
              บทความ
            </NavLink>
            <NavLink href="/contact" active={false}>
              บริการของเรา
            </NavLink>
            <NavLink href="/about" active={pathname === '/about'}>
              เกี่ยวกับเรา
            </NavLink>
            <NavLink href="/contact" active={pathname === '/contact'}>
              ติดต่อเรา
            </NavLink>
          </nav>
          <Link
            href="/quotation"
            className="ml-auto hidden shrink-0 items-center gap-1.5 self-center whitespace-nowrap rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 xl:inline-flex"
          >
            <FileText className="size-4" />
            ขอใบเสนอราคา
          </Link>
        </div>
      </div>
      {menuOpen ? (
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t px-4 py-4 lg:hidden">
          <form onSubmit={submit} className="relative mb-4 md:hidden">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาสินค้า…"
              className="h-11 w-full rounded-xl border pl-10 pr-12"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-emerald-900 p-2 text-white"
              aria-label="ค้นหา"
            >
              <Search className="size-4" />
            </button>
          </form>
          <nav className="grid gap-3 text-sm font-semibold">
            <Link onClick={() => setMenuOpen(false)} href="/">
              หน้าแรก
            </Link>
            <Link onClick={() => setMenuOpen(false)} href="/products">
              หมวดหมู่ / สินค้าทั้งหมด
            </Link>
            <Link onClick={() => setMenuOpen(false)} href="/brands">
              แบรนด์
            </Link>
            <Link
              onClick={() => setMenuOpen(false)}
              href="/products?status=สินค้าลดราคา"
              className="text-rose-700"
            >
              โปรโมชั่น
            </Link>
            <Link onClick={() => setMenuOpen(false)} href="/wishlist">
              ♡ รายการโปรด ({wishlist.count})
            </Link>
            <Link onClick={() => setMenuOpen(false)} href="/compare">
              ⚖ เปรียบเทียบ ({compare.ids.length})
            </Link>
            <Link onClick={() => setMenuOpen(false)} href="/cart">
              🛒 ตะกร้าสินค้า ({count})
            </Link>
            {account ? (
              <Link onClick={() => setMenuOpen(false)} href={account.href}>
                👤 {account.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  showAuth('customer', pathname === '/login' ? '/account' : pathname);
                }}
                className="text-left"
              >
                👤 เข้าสู่ระบบ / สมัครสมาชิก
              </button>
            )}
            <Link onClick={() => setMenuOpen(false)} href="/news">
              บทความ
            </Link>
            <Link onClick={() => setMenuOpen(false)} href="/about">
              เกี่ยวกับเรา
            </Link>
            <Link onClick={() => setMenuOpen(false)} href="/contact">
              ติดต่อเรา
            </Link>
            <Link onClick={() => setMenuOpen(false)} href="/partners">
              ตัวแทนจำหน่าย
            </Link>
            <Link onClick={() => setMenuOpen(false)} href="/quotation">
              📄 ขอใบเสนอราคา
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
