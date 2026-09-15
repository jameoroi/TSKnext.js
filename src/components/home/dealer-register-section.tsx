'use client';

import { Handshake } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BannerCarousel } from '@/components/content/banner-carousel';
import { ProvinceCombobox } from '@/components/forms/province-combobox';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

/**
 * DEALER_REGISTER — STATIC_UI + FORM
 * ----------------------------------------------------------------------------
 * future_data_source: Supabase: dealer_applications
 * form_fields: full_name / shop_name / phone / email / province / message
 * CTA: "สมัครเป็นตัวแทน"
 *
 * ฟอร์มย่อหน้านี้เก็บ 6 ฟิลด์ตามสเปก แล้วส่งต่อข้อมูลไปยัง /partner-register
 * (ฟอร์มเต็มของ framework เดิม ซึ่งจัดการรหัสผ่าน + Turnstile + backend ให้)
 * ผ่าน query params — ไม่ต้องกรอกซ้ำ
 */
const BENEFITS = ['ราคาพิเศษสำหรับตัวแทน', 'มีทีมงานให้คำปรึกษา', 'พร้อมเปิดใบกำกับภาษี', 'สร้างรายได้เสริม'];

export function DealerRegisterSection({
  backgroundImage = '',
  backgroundImages = [],
}: {
  backgroundImage?: string;
  backgroundImages?: string[];
} = {}) {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [province, setProvince] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!fullName.trim() || !shopName.trim() || !phone.trim() || !email.trim() || !province.trim()) {
      setError('กรุณากรอกชื่อ-นามสกุล ชื่อร้าน เบอร์โทร อีเมล และจังหวัดให้ครบ');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('รูปแบบอีเมลไม่ถูกต้อง เช่น name@example.com');
      return;
    }
    const params = new URLSearchParams({
      full_name: fullName.trim(),
      shop_name: shopName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      province: province.trim(),
      message: message.trim(),
    });
    router.push(`/partner-register?${params.toString()}`);
  }

  return (
    <section className="mx-auto max-w-7xl px-4 pb-12 lg:px-6" aria-label="สมัครตัวแทนจำหน่าย">
      <div className="relative isolate grid items-center gap-8 overflow-hidden rounded-3xl bg-emerald-950 px-4 py-12 text-white sm:px-6 lg:grid-cols-2 lg:px-8">
        {(backgroundImages.length > 0 || backgroundImage) && (
          <>
            {/* Full-box picture from the admin (เนื้อหา → พื้นหลังสมัครตัวแทน); dark green stays as fallback. */}
            <BannerCarousel
              background
              slides={(backgroundImages.length ? backgroundImages : [backgroundImage]).map((src) => ({
                src,
              }))}
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-emerald-950/85 via-emerald-950/55 to-emerald-950/30" />
          </>
        )}
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-emerald-200">
            <Handshake size={18} /> THAISERKIT PARTNER
          </p>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">สมัครตัวแทนจำหน่าย</h2>
          <p className="mt-2 max-w-xl text-sm leading-7 text-white/70">
            ร่วมเป็นพันธมิตรกับ THAISERKIT SUPPLY เติบโตไปด้วยกัน โอกาสทางธุรกิจที่มากกว่า
          </p>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-center gap-2 text-sm font-semibold text-emerald-50">
                <span
                  aria-hidden="true"
                  className="grid size-6 place-items-center rounded-full bg-emerald-800 text-xs"
                >
                  ✓
                </span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>
        <form
          onSubmit={submit}
          className="rounded-3xl bg-white p-5 text-slate-900 shadow-2xl sm:p-7"
          noValidate={false}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ชื่อ-นามสกุล" required>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                placeholder="เช่น สมชาย ใจดี"
              />
            </Field>
            <Field label="ชื่อร้าน" required>
              <Input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                autoComplete="organization"
                placeholder="ชื่อร้านของคุณ"
              />
            </Field>
            <Field label="เบอร์โทรศัพท์" required>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                autoComplete="tel"
                placeholder="08x-xxx-xxxx"
              />
            </Field>
            <Field label="อีเมล" required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="name@example.com"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="จังหวัด" required>
                <ProvinceCombobox value={province} onChange={setProvince} placeholder="เลือกจังหวัด" />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="ข้อความเพิ่มเติม">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="เล่าเกี่ยวกับร้านของคุณสั้น ๆ (ถ้ามี)"
                />
              </Field>
            </div>
          </div>
          {error && (
            <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">
              {error}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            className="mt-5 w-full bg-amber-400 font-black text-emerald-950 hover:bg-amber-300"
          >
            สมัครเป็นตัวแทน
          </Button>
        </form>
      </div>
    </section>
  );
}
