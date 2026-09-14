import { Headphones, ShieldCheck, Truck, Wrench } from 'lucide-react';

const TRUST_ITEMS = [
  { title: 'จัดส่งทั่วไทย รวดเร็ว', note: 'รองรับขนส่งทั่วประเทศ', Icon: Truck },
  { title: 'ของแท้ 100%', note: 'สินค้าคุณภาพและการรับประกัน', Icon: ShieldCheck },
  { title: 'บริการหลังการขาย', note: 'ทีมงานพร้อมช่วยทุกปัญหา', Icon: Headphones },
  { title: 'เครื่องมือครบ จบในที่เดียว', note: 'งานช่าง เกษตร และอุตสาหกรรม', Icon: Wrench },
] as const;

export function TrustStrip() {
  return (
    <section className="border-y border-slate-200 bg-slate-50" aria-label="บริการของเรา">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-4 py-5 sm:grid-cols-4 lg:px-6">
        {TRUST_ITEMS.map(({ title, note, Icon }) => (
          <div key={title} className="flex items-center gap-3 px-2 py-3 sm:px-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-900">
              <Icon size={20} strokeWidth={1.9} />
            </span>
            <span className="min-w-0">
              <strong className="block text-sm text-slate-900">{title}</strong>
              <small className="mt-0.5 block text-xs leading-5 text-slate-500">{note}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
