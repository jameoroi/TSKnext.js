'use client';

import {
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  CircleDollarSign,
  Download,
  FileText,
  Gauge,
  Handshake,
  Images,
  LayoutDashboard,
  MessageSquareText,
  Network,
  PackageCheck,
  PackagePlus,
  RotateCcw,
  Star,
  WalletCards,
  ReceiptText,
  Settings,
  ShoppingBag,
  Store,
  Tags,
  TicketPercent,
  Upload,
  UsersRound,
  Warehouse,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { LogoutButton } from '@/components/shared/logout-button';
import { BackendStatus } from '@/components/admin/backend-status';
import { legacyRequest } from '@/lib/legacy-api.client';

type BadgeKey = 'orders' | 'slips' | 'chat' | 'agents';
type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: BadgeKey;
  owner?: boolean;
};
type NavGroup = { group: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    group: 'ภาพรวม',
    items: [
      { href: '/admin', icon: LayoutDashboard, label: 'แดชบอร์ด' },
      { href: '/admin/reports', icon: ChartNoAxesCombined, label: 'รายงานยอดขาย' },
    ],
  },
  {
    group: 'การขาย',
    items: [
      { href: '/admin/orders', icon: ReceiptText, label: 'คำสั่งซื้อ', badge: 'orders' },
      { href: '/admin/chat', icon: MessageSquareText, label: 'แชตลูกค้า', badge: 'chat' },
      { href: '/admin/operations?tab=slips', icon: WalletCards, label: 'ตรวจสลิปชำระเงิน', badge: 'slips' },
      { href: '/admin/operations?tab=returns', icon: RotateCcw, label: 'คืนสินค้า' },
      { href: '/admin/operations?tab=customers', icon: UsersRound, label: 'ลูกค้า / CRM' },
      { href: '/admin/operations?tab=reviews', icon: Star, label: 'รีวิวสินค้า' },
      { href: '/admin/agents', icon: Handshake, label: 'ตัวแทนจำหน่าย', badge: 'agents', owner: true },
      { href: '/admin/commissions', icon: CircleDollarSign, label: 'ค่าคอมมิชชั่น', owner: true },
      { href: '/admin/operations?tab=payouts', icon: CircleDollarSign, label: 'อนุมัติถอนเงิน', owner: true },
      { href: '/admin/suppliers', icon: Store, label: 'Supplier Management', owner: true },
      { href: '/admin/settlements', icon: CircleDollarSign, label: 'Supplier Settlement', owner: true },
    ],
  },
  {
    group: 'สินค้า',
    items: [
      { href: '/admin/products', icon: ShoppingBag, label: 'จัดการสินค้า' },
      { href: '/admin/products-import', icon: Upload, label: 'นำเข้าสินค้า (Excel)' },
      { href: '/admin/products-export', icon: Download, label: 'ส่งออกสินค้า (Excel)' },
      { href: '/admin/categories', icon: Boxes, label: 'หมวดหมู่' },
      { href: '/admin/brands', icon: Tags, label: 'แบรนด์' },
      { href: '/admin/inventory', icon: Warehouse, label: 'คลังสินค้า' },
      { href: '/admin/kits', icon: PackagePlus, label: 'ชุดอุปกรณ์ / Bundle' },
      { href: '/admin/marketplace', icon: Store, label: 'Shopee / Lazada' },
    ],
  },
  {
    group: 'การตลาด',
    items: [
      { href: '/admin/flash-sale', icon: PackageCheck, label: 'Flash Sale' },
      { href: '/admin/content', icon: FileText, label: 'เนื้อหาหน้าแรก' },
      { href: '/admin/coupons', icon: TicketPercent, label: 'คูปองส่วนลด' },
      { href: '/admin/crm', icon: MessageSquareText, label: 'CRM / Newsletter' },
    ],
  },
  {
    group: 'ตั้งค่า',
    items: [
      { href: '/admin/settings', icon: Settings, label: 'ตั้งค่าเว็บไซต์' },
      { href: '/admin/team', icon: UsersRound, label: 'ทีมงานและสิทธิ์', owner: true },
      { href: '/admin/operations?tab=media', icon: Images, label: 'Media Manager' },
      { href: '/admin/operations?tab=audit', icon: Gauge, label: 'Audit Log' },
      { href: '/admin/operations', icon: Gauge, label: 'Advanced API Console' },
      { href: '/operations/network', icon: Network, label: 'สถานะระบบข้อมูล', owner: true },
      { href: '/owner', icon: Images, label: 'Owner Console', owner: true },
    ],
  },
];

const STORAGE_KEY = 'tsk-admin-nav-open';

function cappedCount(value: number) {
  return value > 99 ? '99+' : String(value);
}

export function AdminShell({ children, username, owner }: { children: React.ReactNode; username?: string; owner?: boolean }) {
  const path = usePathname();
  const searchParams = useSearchParams();
  const [badges, setBadges] = useState<Record<BadgeKey, number>>({ orders: 0, slips: 0, chat: 0, agents: 0 });
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  const groups = useMemo(() => NAV
    .map((section) => ({ ...section, items: section.items.filter((item) => !item.owner || owner) }))
    .filter((section) => section.items.length), [owner]);

  const isActive = (href: string) => { const [clean, query] = href.split('?'); if (clean === '/admin') return path === clean; if (!path.startsWith(clean)) return false; if (!query) return path === clean && !searchParams.get('tab'); const expected = new URLSearchParams(query).get('tab'); return expected ? searchParams.get('tab') === expected : true; };
  const activeGroup = groups.find((section) => section.items.some((item) => isActive(item.href)))?.group || '';
  const isOpen = (group: string) => openGroups.includes(group) || group === activeGroup;

  function countFor(key: BadgeKey) {
    const value = Number(badges[key] || 0);
    return key === 'orders' ? value + Number(badges.slips || 0) : value;
  }

  function groupCount(group: string) {
    return groups.find((section) => section.group === group)?.items.reduce((total, item) => total + (item.badge ? countFor(item.badge) : 0), 0) || 0;
  }

  function toggleGroup(group: string) {
    const next = isOpen(group) ? openGroups.filter((name) => name !== group) : [...openGroups, group];
    setOpenGroups(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {
      // Private browsing should not break navigation.
    }
  }

  async function loadBadges() {
    try {
      const answer = await legacyRequest<{ ok?: boolean; badges?: Partial<Record<BadgeKey, number>> }>('admin.badges');
      if (!answer?.ok) return;
      setBadges({
        orders: Number(answer.badges?.orders || 0),
        slips: Number(answer.badges?.slips || 0),
        chat: Number(answer.badges?.chat || 0),
        agents: Number(answer.badges?.agents || 0),
      });
    } catch {
      // A missed poll must never disturb a working admin page.
    }
  }

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(saved)) setOpenGroups(saved.filter((name): name is string => typeof name === 'string'));
    } catch {
      // Keep the active group open if the stored value is unreadable.
    }
  }, []);

  useEffect(() => {
    void loadBadges();
  }, [path]);

  useEffect(() => {
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadBadges();
    }, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void loadBadges(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return <div className="min-h-screen bg-slate-100 text-slate-950">
    <div className="grid min-h-screen lg:grid-cols-[270px_1fr]">
      <aside className="border-r bg-emerald-950 p-4 text-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <Link href="/admin" className="mb-5 block rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs font-bold tracking-[.18em] text-emerald-200">THAISERKIT</div>
          <div className="mt-1 text-xl font-bold">Control Center</div>
          <div className="mt-1 text-xs text-white/55">Next.js GodTier</div>
        </Link>

        <nav className="space-y-2" aria-label="เมนูผู้ดูแลระบบ">
          {groups.map((section) => {
            const total = groupCount(section.group);
            const opened = isOpen(section.group);
            return <section key={section.group} className="rounded-2xl border border-white/10 bg-white/[.035] p-1.5">
              <button type="button" onClick={() => toggleGroup(section.group)} className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-black uppercase tracking-[.08em] text-emerald-100/80 hover:bg-white/5" aria-expanded={opened}>
                <span>{section.group}</span>
                <span className="flex items-center gap-2">{total > 0 && <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] leading-none text-white">{cappedCount(total)}</span>}<ChevronDown size={15} className={`transition ${opened ? 'rotate-180' : ''}`}/></span>
              </button>
              {opened && <div className="mt-1 grid gap-1">{section.items.map(({ href, icon: Icon, label, badge }) => {
                const active = isActive(href);
                const count = badge ? countFor(badge) : 0;
                return <Link key={href} href={href} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition ${active ? 'bg-white text-emerald-950' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}>
                  <Icon size={17}/><span className="min-w-0 flex-1 truncate">{label}</span>{count > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none ${active ? 'bg-rose-100 text-rose-700' : 'bg-rose-500 text-white'}`}>{cappedCount(count)}</span>}
                </Link>;
              })}</div>}
            </section>;
          })}
        </nav>
      </aside>

      <main className="min-w-0">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b bg-white/90 px-4 backdrop-blur md:px-7">
          <div><p className="text-xs text-slate-500">Admin workspace · {owner ? 'Super Admin' : 'Admin'}</p><strong>{username || 'ผู้ดูแลระบบ'}</strong></div>
          <div className="flex items-center gap-2"><Link className="rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-slate-50" href="/">ดูหน้าร้าน</Link><LogoutButton role="admin"/></div>
        </header>
        <BackendStatus/>
        <div className="p-4 md:p-7">{children}</div>
      </main>
    </div>
  </div>;
}
