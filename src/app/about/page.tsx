import type { Metadata } from 'next';
import Link from 'next/link';
import { publicEnv } from '@/lib/public-env';
import { getSiteSettings } from '@/server/catalog';

export const metadata: Metadata = { title: 'เกี่ยวกับเรา | THAISERKIT SUPPLY' };

function text(value: unknown, fallback = '') {
  const out = String(value ?? '').trim();
  return out || fallback;
}

export default async function AboutPage() {
  const site = await getSiteSettings();
  const business = (site.business && typeof site.business === 'object' ? site.business : {}) as Record<
    string,
    unknown
  >;
  const company = text(site.company_name, 'THAISERKIT SUPPLY');
  const legalName = text(business.legal_name, company);
  const tradingName = text(business.trading_name, company);
  const street = text(business.street, '89 หมู่ 9 บ้านห้วยบง ต.น้ำแวน');
  const locality = [
    text(business.locality, 'อ.เชียงคำ'),
    text(business.region, 'จ.พะเยา'),
    text(business.postal_code, '56110'),
  ]
    .filter(Boolean)
    .join(' ');
  const phone = text(business.phone, publicEnv('NEXT_PUBLIC_CONTACT_PHONE') || undefined || '088-2608042');
  const email = text(business.email, 'thaiserkit.supply@gmail.com');
  const hours = text(business.opening_hours, 'จันทร์ – เสาร์ 07.00 – 17.00 น.');
  const storeImage = text(site.home_cards?.about_image_url || site.about_image_url || site.store_image_url);

  const facts: Array<{ label: string; value: string }> = [
    { label: 'ชื่อนิติบุคคล', value: legalName },
    { label: 'ชื่อทางการค้า', value: tradingName },
    { label: 'ที่ตั้งกิจการ', value: [street, locality].filter(Boolean).join(' ') },
    { label: 'โทรศัพท์', value: phone },
    { label: 'อีเมล', value: email },
    { label: 'เวลาทำการ', value: hours },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:py-10">
      <nav className="flex items-center gap-1.5 text-sm text-slate-500" aria-label="เส้นทางหน้า">
        <Link href="/" className="hover:text-emerald-800">
          หน้าแรก
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-slate-700">เกี่ยวกับเรา</span>
      </nav>

      <h1 className="mt-3 text-2xl font-bold sm:text-3xl">เกี่ยวกับเรา</h1>
      <p className="mt-2 text-sm text-slate-500">
        ผู้จำหน่ายเครื่องมือช่าง อุปกรณ์การเกษตร และเครื่องมือไฟฟ้าคุณภาพ ที่คนเชียงคำไว้วางใจ
      </p>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          {storeImage ? (
            // รูปหน้าร้านจาก CMS อาจเป็น CDN/data URL ใด ๆ — ใช้ img ธรรมดา
            // biome-ignore lint/performance/noImgElement: CMS stores arbitrary CDN/data URLs
            <img
              src={storeImage}
              alt={`${company} หน้าร้าน`}
              loading="lazy"
              decoding="async"
              className="aspect-[16/10] w-full object-cover"
            />
          ) : (
            <div
              role="img"
              aria-label="รูปหน้าร้าน (รอรูปจากระบบหลังบ้าน)"
              className="grid aspect-[16/10] w-full place-items-center bg-slate-50 p-6 text-center"
            >
              <div>
                <p className="text-sm font-black text-slate-500">STORE_IMAGE</p>
                <p className="mt-1 text-xs text-slate-400">รูปหน้าร้านจะแสดงที่นี่เมื่อมีข้อมูลจากระบบหลังบ้าน</p>
              </div>
            </div>
          )}
        </div>
        <section className="rounded-2xl border bg-white p-6 shadow-sm sm:p-7" aria-label="เรื่องราวของเรา">
          <h2 className="text-xl font-bold">เรื่องราวของเรา</h2>
          <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600">
            <p>
              {company} ก่อตั้งขึ้นจากความตั้งใจที่จะเป็นร้านจำหน่ายเครื่องมือช่างและอุปกรณ์การเกษตรครบวงจร
              ให้กับพี่น้องชาวเชียงคำและพื้นที่ใกล้เคียง
            </p>
            <p>
              เราคัดสรรสินค้าคุณภาพและของแท้ ได้รับรองมาตรฐาน พร้อมทั้งให้คำปรึกษาโดยทีมงานที่มีความรู้ความเข้าใจ
              ในไลน์สินค้าอย่างแท้จริง เพื่อให้ลูกค้าทุกท่านได้ของดี ในราคาที่คุ้มค่าที่สุด
            </p>
            <p>
              วันนี้เราให้บริการทั้งหน้าร้านและช่องทางออนไลน์ พร้อมจัดส่งสินค้าทั่วประเทศ เพื่อให้ทุกคนเข้าถึงเครื่องมือคุณภาพได้อย่างมั่นใจ
            </p>
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border bg-white p-6 shadow-sm sm:p-7" aria-label="ข้อมูลผู้ประกอบการ">
        <h2 className="font-bold">ข้อมูลผู้ประกอบการ</h2>
        <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-xs text-slate-400">{fact.label}</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-800">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
