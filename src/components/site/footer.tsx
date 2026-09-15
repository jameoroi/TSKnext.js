'use client';

import { useQuery } from '@tanstack/react-query';
import { Mail, MapPin, Phone } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { openConsentSettings } from '@/features/privacy/consent';
import { legacyRequest } from '@/lib/legacy-api.client';
import { publicEnv } from '@/lib/public-env';
import { PaymentBadges, SocialBadge } from './brand-badges';
import { Newsletter } from './newsletter';

function text(value: unknown, fallback = '') {
  const out = String(value ?? '').trim();
  return out || fallback;
}

const QUICK_LINKS = [
  { href: '/', label: 'หน้าแรก' },
  { href: '/products', label: 'สินค้า' },
  { href: '/brands', label: 'แบรนด์' },
  { href: '/products?status=สินค้าลดราคา', label: 'โปรโมชั่น' },
  { href: '/news', label: 'บทความ' },
  { href: '/about', label: 'เกี่ยวกับเรา' },
  { href: '/contact', label: 'ติดต่อเรา' },
];

const SERVICE_LINKS = [
  { href: '/products', label: 'วิธีการสั่งซื้อ' },
  { href: '/verify-payment', label: 'การชำระเงิน' },
  { href: '/track-order', label: 'การจัดส่ง' },
  { href: '/returns', label: 'การรับประกันสินค้า' },
  { href: '/contact', label: 'ติดต่อเรา' },
];

export function Footer() {
  const [year, setYear] = useState('');
  useEffect(() => {
    setYear(String(new Date().getFullYear()));
  }, []);
  const siteQuery = useQuery({
    queryKey: ['site.settings', 'compact'],
    queryFn: () => legacyRequest<{ settings?: Record<string, unknown> }>('site.settings', { compact: 1 }),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const site = (siteQuery.data?.settings || {}) as Record<string, unknown>;
  const business = (
    site.business && typeof site.business === 'object' ? (site.business as Record<string, unknown>) : {}
  ) as Record<string, unknown>;
  const company = text(site.company_name, 'THAISERKIT SUPPLY');
  const subtitle = text(site.company_subtitle, 'เครื่องมือ อุปกรณ์ และโซลูชันสำหรับงานช่าง เกษตร และอุตสาหกรรม');
  const legalName = text(business.legal_name, company);
  const phone = text(business.phone, publicEnv('NEXT_PUBLIC_CONTACT_PHONE') || undefined || '088-2608042');
  const email = text(business.email, 'thaiserkit.supply@gmail.com');
  const street = text(business.street, '89 หมู่ 9 บ้านห้วยบง ต.น้ำแวน');
  const locality = [
    text(business.locality, 'อ.เชียงคำ'),
    text(business.region, 'จ.พะเยา'),
    text(business.postal_code, '56110'),
  ]
    .filter(Boolean)
    .join(' ');
  const openingHours = text(business.opening_hours, 'จันทร์ – เสาร์ 07.00 – 17.00 น.');
  // LINE OA stays visible when the public env value does not reach the Worker:
  // fall back to the shop's LINE id (NEXT_PUBLIC_LINE_OA_ID, default @thaiserkit).
  const lineId = text(publicEnv('NEXT_PUBLIC_LINE_OA_ID') || undefined, '@thaiserkit');
  const lineUrl = text(
    publicEnv('NEXT_PUBLIC_LINE_OA_URL') || undefined,
    `https://line.me/R/ti/p/${encodeURIComponent(lineId)}`,
  );
  const facebookUser = text(publicEnv('NEXT_PUBLIC_FB_PAGE_USERNAME') || undefined);
  const facebookUrl = facebookUser ? `https://facebook.com/${facebookUser}` : '';

  return (
    <footer className="bg-emerald-950 text-emerald-50">
      <Newsletter />
      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-6">
        <div className="grid gap-9 md:grid-cols-2 xl:grid-cols-[1.4fr_.7fr_.7fr_1.1fr]">
          <section>
            <Link href="/" className="inline-flex items-center gap-3">
              <Image
                src={String(site.logo_url || '/legacy-assets/logo.png')}
                alt=""
                width={48}
                height={48}
                className="size-12 object-contain"
                unoptimized={String(site.logo_url || '').startsWith('/api')}
              />
              <span>
                <strong className="block text-lg">{company}</strong>
                <small className="text-emerald-100/65">{subtitle}</small>
              </span>
            </Link>
            <address className="mt-4 grid gap-2 text-sm not-italic text-emerald-100/70">
              {(street || locality) && (
                <span className="flex gap-2">
                  <MapPin size={16} className="mt-0.5 shrink-0" />
                  <span>
                    {street}
                    {street && locality ? <br /> : null}
                    {locality}
                  </span>
                </span>
              )}
              {phone && (
                <a
                  href={`tel:${phone.replace(/[^+\d]/g, '')}`}
                  className="tsk-link flex items-center gap-2 hover:text-white"
                >
                  <Phone size={16} />
                  {phone}
                </a>
              )}
              {email && (
                <a href={`mailto:${email}`} className="tsk-link flex items-center gap-2 hover:text-white">
                  <Mail size={16} />
                  {email}
                </a>
              )}
              {openingHours && <span className="text-xs text-emerald-100/55">({openingHours})</span>}
            </address>
            <div className="mt-5 flex flex-wrap gap-2.5" aria-label="ช่องทางโซเชียล">
              <SocialBadge service="line" href={lineUrl} label="LINE OA" />
              <SocialBadge service="facebook" href={facebookUrl || undefined} />
              <SocialBadge service="youtube" />
              <SocialBadge service="tiktok" />
              <SocialBadge service="instagram" />
            </div>
          </section>

          <section>
            <h4 className="font-semibold">ลิงก์ด่วน</h4>
            <div className="flink mt-3 grid gap-2 text-sm text-emerald-100/70">
              {QUICK_LINKS.map((l) => (
                <Link key={l.href + l.label} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </div>
          </section>
          <section>
            <h4 className="font-semibold">บริการลูกค้า</h4>
            <div className="flink mt-3 grid gap-2 text-sm text-emerald-100/70">
              {SERVICE_LINKS.map((l) => (
                <Link key={l.href + l.label} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h4 className="font-semibold">ติดต่อเรา</h4>
            <address className="flink mt-3 grid gap-2 text-sm not-italic text-emerald-100/70">
              {(street || locality) && (
                <span className="flex gap-2">
                  <MapPin size={16} className="mt-0.5 shrink-0" />
                  <span>
                    {street}
                    {street && locality ? <br /> : null}
                    {locality}
                  </span>
                </span>
              )}
              {phone && (
                <a
                  href={`tel:${phone.replace(/[^+\d]/g, '')}`}
                  className="tsk-link flex items-center gap-2 hover:text-white"
                >
                  <Phone size={16} />
                  {phone}
                </a>
              )}
              {email && (
                <a href={`mailto:${email}`} className="tsk-link flex items-center gap-2 hover:text-white">
                  <Mail size={16} />
                  {email}
                </a>
              )}
              {openingHours && <span className="text-xs text-emerald-100/55">เวลาทำการ: {openingHours}</span>}
            </address>
          </section>
        </div>

        <div className="mt-9 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6">
          <strong className="text-sm text-emerald-100/80">{legalName}</strong>
          <PaymentBadges />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-emerald-100/55">
          <span>
            © {year} {legalName}. สงวนลิขสิทธิ์ทั้งหมด
          </span>
          <div className="flex gap-4">
            <button type="button" onClick={openConsentSettings} className="hover:text-white tsk-link">
              ตั้งค่าคุกกี้
            </button>
            <Link href="/privacy" className="tsk-link hover:text-white">
              นโยบายความเป็นส่วนตัว
            </Link>
            <Link href="/terms" className="tsk-link hover:text-white">
              เงื่อนไขการใช้งาน
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
