import { Clock, Facebook, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactForm } from '@/components/forms/contact-form';
import { publicEnv } from '@/lib/public-env';

export const metadata: Metadata = {
  title: 'ติดต่อเรา | THAISERKIT SUPPLY',
  description: 'ติดต่อ THAISERKIT SUPPLY เพื่อขอข้อมูลสินค้า ใบเสนอราคา และบริการหลังการขาย โทร 088-2608042',
};

const ADDRESS = '89 หมู่ 9 บ้านห้วยบง ต.น้ำแวน อ.เชียงคำ จ.พะเยา 56110';
const PHONE = publicEnv('NEXT_PUBLIC_CONTACT_PHONE') || undefined || '088-2608042';
const EMAIL = 'thaiserkit.supply@gmail.com';
const HOURS = 'จันทร์ – เสาร์ 07.00 – 17.00 น.';
const LINE_URL = publicEnv('NEXT_PUBLIC_LINE_OA_URL') || undefined || '';
const FB_USER = publicEnv('NEXT_PUBLIC_FB_PAGE_USERNAME') || undefined || '';

export default function Page() {
  const channels = [
    { icon: MapPin, label: 'ที่อยู่ร้าน', value: ADDRESS },
    { icon: Phone, label: 'โทรศัพท์', value: PHONE, href: `tel:${PHONE.replace(/[^+\d]/g, '')}` },
    { icon: Mail, label: 'อีเมล', value: EMAIL, href: `mailto:${EMAIL}` },
    { icon: Clock, label: 'เวลาทำการ', value: HOURS },
    ...(LINE_URL
      ? [{ icon: MessageCircle, label: 'LINE OA', value: 'แชทกับทีมงาน', href: LINE_URL, external: true }]
      : []),
    ...(FB_USER
      ? [
          {
            icon: Facebook,
            label: 'Messenger',
            value: 'ส่งข้อความถึงเพจ',
            href: `https://m.me/${FB_USER}`,
            external: true,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:py-10">
      <nav className="flex items-center gap-1.5 text-sm text-slate-500" aria-label="เส้นทางหน้า">
        <Link href="/" className="hover:text-emerald-800">
          หน้าแรก
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-slate-700">ติดต่อเรา</span>
      </nav>
      <h1 className="mt-3 text-2xl font-bold sm:text-3xl">ติดต่อเรา</h1>
      <p className="mt-2 text-sm text-slate-500">
        สอบถามสินค้า ขอใบเสนอราคา หรือแจ้งปัญหาการใช้งาน ทีมงานยินดีให้คำปรึกษาทุกวันทำการ
      </p>
      <div className="grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <div className="space-y-3">
          {channels.map(({ icon: Icon, label, value, href, external }) => (
            <div key={label} className="flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-sm">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800">
                <Icon size={19} />
              </span>
              <div className="min-w-0">
                <b className="block text-sm">{label}</b>
                {href ? (
                  <a
                    href={href}
                    target={external ? '_blank' : undefined}
                    rel={external ? 'noopener noreferrer' : undefined}
                    className="mt-0.5 block break-words text-sm text-slate-600 hover:text-emerald-800 tsk-link"
                  >
                    {value}
                  </a>
                ) : (
                  <span className="mt-0.5 block text-sm text-slate-600">{value}</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <ContactForm />
      </div>

      <section className="mt-10 rounded-3xl border border-emerald-100 bg-emerald-50/70 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="max-w-xl">
            <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">
              THAISERKIT PARTNER
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-900">มีลูกค้าอยู่แล้ว? เปลี่ยนการแนะนำสินค้าเป็นรายได้</h2>
            <p className="mt-2 text-sm leading-7 text-slate-600">
              สมัครเป็นตัวแทนจำหน่าย รับลิงก์ร้านของคุณเอง ติดตามค่าคอมมิชชันและขอถอนได้ในระบบ
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/partner-register"
              className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-600"
            >
              สมัครเป็นตัวแทน
            </Link>
            <Link
              href="/partners"
              className="rounded-xl border border-emerald-300 bg-white px-5 py-3 text-sm font-black text-emerald-800 transition hover:bg-emerald-50"
            >
              ดูรายละเอียดระบบตัวแทน
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
