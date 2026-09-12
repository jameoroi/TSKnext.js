import { Headset, ShieldCheck, Truck, Undo2, Wallet } from 'lucide-react';

const ITEMS = [
  { icon: Truck, title: 'จัดส่งทั่วไทย 1–3 วัน', desc: 'หลายช่องทาง' },
  { icon: ShieldCheck, title: 'สินค้าแท้ 100%', desc: 'มั่นใจได้ทุกชิ้น' },
  { icon: Undo2, title: 'คืนสินค้าใน 7 วัน', desc: 'ยินดีเปลี่ยนใหม่' },
  { icon: Headset, title: 'ทีมงานผู้เชี่ยวชาญ', desc: 'พร้อมให้คำปรึกษา' },
  { icon: Wallet, title: 'ชำระเงินปลอดภัย', desc: 'หลากหลายช่องทาง' },
];

/** แถบจุดขาย 5 ช่องท้ายหน้าแรก */
export function ServiceBenefits() {
  return (
    <section className="border-t border-slate-200 bg-white" aria-label="จุดเด่นบริการ">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-8 sm:grid-cols-3 lg:grid-cols-5 lg:px-6">
        {ITEMS.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-800">
              <Icon size={22} />
            </span>
            <span>
              <strong className="block text-sm">{title}</strong>
              <small className="block text-xs text-slate-500">{desc}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
