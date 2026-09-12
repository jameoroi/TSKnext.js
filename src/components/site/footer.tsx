'use client';

import { useQuery } from '@tanstack/react-query';
import { Facebook, Instagram, Mail, MapPin, Music2, Phone, QrCode } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { openConsentSettings } from '@/features/privacy/consent';
import { legacyRequest } from '@/lib/legacy-api.client';
import { Newsletter } from './newsletter';

function text(value: unknown, fallback = '') {
  const out = String(value ?? '').trim();
  return out || fallback;
}

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
  const site = siteQuery.data?.settings || {};
  const business =
    site.business && typeof site.business === 'object' ? (site.business as Record<string, unknown>) : {};
  const company = text(site.company_name, 'THAISERKIT SUPPLY');
  const subtitle = text(site.company_subtitle, 'เครื่องมือ อุปกรณ์ และโซลูชันสำหรับงานช่าง เกษตร และอุตสาหกรรม');
  const legalName = text(business.legal_name, company);
  const phone = text(business.phone, process.env.NEXT_PUBLIC_CONTACT_PHONE || '088-2608042');
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
  const registration = text(business.registration_number);
  const taxId = text(business.tax_id);
  const lineUrl = text(process.env.NEXT_PUBLIC_LINE_OA_URL);
  const lineQr = text(process.env.NEXT_PUBLIC_LINE_QR_URL);
  const lineId = text(process.env.NEXT_PUBLIC_LINE_OA_ID, '@thaiserkit');
  const facebookUser = text(process.env.NEXT_PUBLIC_FB_PAGE_USERNAME);
  const facebookUrl = facebookUser ? `https://facebook.com/${facebookUser}` : '';
  const tiktokUrl = text(process.env.NEXT_PUBLIC_TIKTOK_URL);
  const instagramUrl = text(process.env.NEXT_PUBLIC_INSTAGRAM_URL);
  const hasSocial = Boolean(facebookUrl || lineUrl || tiktokUrl || instagramUrl);

  return (
    <footer className="bg-emerald-950 text-emerald-50">
      <Newsletter />
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-9 md:grid-cols-2 xl:grid-cols-[1.3fr_.75fr_.75fr_1.1fr]">
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
            <p className="mt-4 max-w-md text-sm leading-7 text-emerald-100/70">
              ศูนย์รวมเครื่องมือช่าง อุปกรณ์การเกษตร อะไหล่ และโซลูชันสำหรับมืออาชีพ พร้อมบริการก่อนและหลังการขาย
            </p>
            {hasSocial && (
              <div className="mt-4 flex flex-wrap gap-2">
                {facebookUrl && (
                  <a
                    href={facebookUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Facebook"
                    title="Facebook"
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold hover:bg-white/10"
                  >
                    <Facebook size={15} />
                    Facebook
                  </a>
                )}
                {lineUrl && (
                  <a
                    href={lineUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="LINE OA"
                    title="LINE OA"
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold hover:bg-white/10"
                  >
                    <QrCode size={15} />
                    LINE OA
                  </a>
                )}
                {tiktokUrl && (
                  <a
                    href={tiktokUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="TikTok"
                    title="TikTok"
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold hover:bg-white/10"
                  >
                    <Music2 size={15} />
                    TikTok
                  </a>
                )}
                {instagramUrl ? (
                  <a
                    href={instagramUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Instagram"
                    title="Instagram"
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold hover:bg-white/10"
                  >
                    <Instagram size={15} />
                    Instagram
                  </a>
                ) : (
                  <span
                    role="img"
                    aria-label="Instagram (ยังไม่เปิดใช้งาน)"
                    title="Instagram (ยังไม่เปิดใช้งาน)"
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-emerald-100/40"
                  >
                    <Instagram size={15} />
                    Instagram
                  </span>
                )}
              </div>
            )}
            {lineQr && (
              <figure className="mt-4 flex items-center gap-3">
                <Image
                  src={lineQr}
                  alt="QR code สำหรับเพิ่มเพื่อนทาง LINE"
                  width={88}
                  height={88}
                  loading="lazy"
                  className="rounded-xl bg-white p-1"
                />
                <figcaption className="text-xs text-emerald-100/70">
                  แอดไลน์
                  <br />
                  <strong className="text-sm text-white">{lineId}</strong>
                </figcaption>
              </figure>
            )}
          </section>

          <section>
            <h4 className="font-semibold">ข้อมูลบริษัท</h4>
            <div className="flink mt-3 grid gap-2 text-sm text-emerald-100/70">
              <Link href="/about">เกี่ยวกับเรา</Link>
              <Link href="/partners">ตัวแทนจำหน่าย</Link>
              <Link href="/partner-register">สมัครเป็นตัวแทน</Link>
              <Link href="/terms">เงื่อนไขการใช้งาน</Link>
              <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>
            </div>
          </section>
          <section>
            <h4 className="font-semibold">บริการลูกค้า</h4>
            <div className="flink mt-3 grid gap-2 text-sm text-emerald-100/70">
              <Link href="/products">วิธีการสั่งซื้อ</Link>
              <Link href="/verify-payment">การชำระเงิน</Link>
              <Link href="/track-order">การจัดส่ง</Link>
              <Link href="/returns">การรับประกันสินค้า</Link>
              <Link href="/contact">ติดต่อเรา</Link>
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
                  className="flex items-center gap-2 hover:text-white"
                >
                  <Phone size={16} />
                  {phone}
                </a>
              )}
              {email && (
                <a href={`mailto:${email}`} className="flex items-center gap-2 hover:text-white">
                  <Mail size={16} />
                  {email}
                </a>
              )}
              {openingHours && <span className="text-xs text-emerald-100/55">เวลาทำการ: {openingHours}</span>}
            </address>
          </section>
        </div>

        <div className="mt-9 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-emerald-100/60">
          <div className="grid gap-1">
            <strong className="font-semibold text-emerald-100/80">{legalName}</strong>
            {registration && <span>เลขทะเบียนนิติบุคคล {registration}</span>}
            {taxId && <span>เลขประจำตัวผู้เสียภาษี {taxId}</span>}
          </div>
          <ul className="flex flex-wrap items-center gap-2" aria-label="ช่องทางการชำระเงิน">
            <li className="rounded border border-white/15 px-2 py-1 font-black italic">VISA</li>
            <li className="rounded border border-white/15 px-2 py-1 font-bold">Mastercard</li>
            <li className="rounded border border-white/15 px-2 py-1 font-bold">PromptPay</li>
            <li className="rounded border border-white/15 px-2 py-1 font-bold">COD</li>
            <li className="rounded border border-white/15 px-2 py-1 font-bold">โอนเงิน</li>
          </ul>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-emerald-100/55">
          <span>
            © {year} {legalName}. สงวนลิขสิทธิ์ทุกประการ
          </span>
          <div className="flex gap-4">
            <button type="button" onClick={openConsentSettings} className="hover:text-white hover:underline">
              ตั้งค่าคุกกี้
            </button>
            <Link href="/privacy" className="hover:text-white">
              ความเป็นส่วนตัว
            </Link>
            <Link href="/terms" className="hover:text-white">
              ข้อกำหนด
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
