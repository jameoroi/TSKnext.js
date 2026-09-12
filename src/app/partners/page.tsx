import { CircleDollarSign, PackageCheck, Store } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHero } from '@/components/content/page-hero';

export const metadata: Metadata = {
  title: 'สมัครตัวแทนจำหน่าย | THAISERKIT SUPPLY',
  description:
    'สมัครเป็นตัวแทนจำหน่าย THAISERKIT SUPPLY ไม่ต้องสต๊อกสินค้า รับค่าคอมมิชชั่นทุกออเดอร์ พร้อมหน้าร้านออนไลน์เป็นของตัวเอง',
};

const BENEFITS = [
  { icon: PackageCheck, title: 'ไม่ต้องสต๊อกสินค้า', body: 'แชร์ลิงก์ร้านของคุณ บริษัทจัดส่งและดูแลหลังการขายให้ทั้งหมด' },
  {
    icon: CircleDollarSign,
    title: 'ค่าคอมมิชชั่นทุกออเดอร์',
    body: 'ระบบผูกออเดอร์เข้ากับลิงก์ของคุณอัตโนมัติ ตรวจสอบยอดได้ตลอดเวลา',
  },
  { icon: Store, title: 'ร้านออนไลน์เป็นของคุณ', body: 'ได้หน้าร้านพร้อมชื่อและลิงก์ของตัวเอง ส่งให้ลูกค้าได้ทันที' },
  {
    icon: CircleDollarSign,
    title: 'ขอถอนได้ในระบบ',
    body: 'ดูยอดค้างรับ ประวัติการถอน และสถานะการโอนได้จาก Agent Center',
  },
];

const STEPS = [
  { no: '01', title: 'สมัครออนไลน์', body: 'กรอกข้อมูลผู้สมัคร ชื่อร้าน และบัญชีรับค่าคอมมิชชัน' },
  { no: '02', title: 'รออนุมัติ', body: 'ทีมงานตรวจสอบข้อมูลและอนุมัติสถานะตัวแทน' },
  { no: '03', title: 'รับลิงก์ร้าน', body: 'เข้า Agent Center เพื่อรับลิงก์ร้านและสื่อการขาย' },
  { no: '04', title: 'แชร์และรับรายได้', body: 'แชร์ลิงก์ให้ลูกค้า ติดตามยอดขายและขอถอนค่าคอมมิชชัน' },
];

const FAQS = [
  { q: 'มีค่าใช้จ่ายในการสมัครไหม?', a: 'ไม่มีค่าสมัครและไม่มีค่ารักษาสถานะตัวแทน' },
  { q: 'ต้องซื้อสินค้าเก็บไว้ก่อนหรือไม่?', a: 'ไม่ต้อง บริษัทเป็นผู้เก็บสต๊อก จัดส่ง และดูแลหลังการขายให้ทั้งหมด' },
  {
    q: 'ได้ค่าคอมมิชชันเมื่อไร?',
    a: 'เมื่อออเดอร์ที่มาจากลิงก์ของคุณชำระเงินและจัดส่งสำเร็จ ยอดจะเข้าสู่ยอดค้างรับใน Agent Center',
  },
  { q: 'ใช้เวลาอนุมัตินานแค่ไหน?', a: 'โดยทั่วไปภายใน 1-2 วันทำการ ทีมงานจะติดต่อกลับตามเบอร์ที่แจ้งไว้' },
];

export default function Page() {
  return (
    <>
      <PageHero
        title="สมัครเป็นตัวแทนจำหน่าย"
        subtitle="เปลี่ยนการแนะนำสินค้าให้เป็นรายได้ประจำ ไม่ต้องลงทุนสต๊อก ไม่ต้องแพ็คของ บริษัทดูแลให้ทั้งหมด"
        action={{ label: 'สมัครเป็นตัวแทน', href: '/partner-register' }}
      />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/login?role=agent"
            className="rounded-xl border px-5 py-2.5 text-sm font-bold hover:border-emerald-400"
          >
            เข้าสู่ระบบตัวแทน
          </Link>
        </div>

        <section className="mt-10" aria-labelledby="partner-benefits">
          <h2 id="partner-benefits" className="text-center text-2xl font-black">
            ทำไมต้องเป็นตัวแทน <span className="text-emerald-700">กับเรา</span>
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-3xl border bg-white p-6 shadow-sm">
                <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-800">
                  <Icon size={21} />
                </span>
                <b className="mt-3 block">{title}</b>
                <p className="mt-1 text-sm leading-6 text-slate-500">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12" aria-labelledby="partner-steps">
          <h2 id="partner-steps" className="text-center text-2xl font-black">
            ขั้นตอน <span className="text-emerald-700">ง่าย ๆ 4 ขั้น</span>
          </h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.no} className="rounded-3xl border bg-white p-6 shadow-sm">
                <i className="grid size-9 place-items-center rounded-full bg-emerald-800 text-sm font-black not-italic text-white">
                  {s.no}
                </i>
                <b className="mt-3 block">{s.title}</b>
                <p className="mt-1 text-sm leading-6 text-slate-500">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12" aria-labelledby="partner-faq">
          <h2 id="partner-faq" className="text-center text-2xl font-black">
            คำถาม <span className="text-emerald-700">ที่พบบ่อย</span>
          </h2>
          <div className="mx-auto mt-6 grid max-w-3xl gap-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-2xl border bg-white px-5 shadow-sm">
                <summary className="cursor-pointer list-none py-4 text-sm font-bold marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span
                      aria-hidden="true"
                      className="text-lg leading-none text-emerald-700 group-open:hidden"
                    >
                      +
                    </span>
                    <span
                      aria-hidden="true"
                      className="hidden text-lg leading-none text-emerald-700 group-open:inline"
                    >
                      −
                    </span>
                  </span>
                </summary>
                <p className="pb-5 text-sm leading-7 text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-12 overflow-hidden rounded-3xl bg-emerald-950 p-6 text-white sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-xl">
              <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-300">
                พร้อมเริ่มแล้วใช่ไหม
              </p>
              <h2 className="mt-2 text-2xl font-black">สมัครวันนี้ ใช้เวลาไม่ถึง 5 นาที</h2>
              <p className="mt-2 text-sm leading-7 text-white/70">
                กรอกข้อมูลออนไลน์ รอทีมงานอนุมัติ แล้วเริ่มแชร์ลิงก์ร้านของคุณได้ทันที
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/partner-register"
                className="rounded-xl bg-white px-6 py-3 text-sm font-black text-emerald-950"
              >
                กรอกใบสมัคร
              </Link>
              <Link
                href="/contact"
                className="rounded-xl border border-white/30 px-6 py-3 text-sm font-black"
              >
                สอบถามทีมงาน
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
