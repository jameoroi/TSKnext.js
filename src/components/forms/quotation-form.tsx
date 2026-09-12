'use client';

import { FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Turnstile } from '@/components/forms/turnstile';
import { Button } from '@/components/ui/button';
import { Field, FormNotice, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';

export function QuotationForm() {
  const [form, setForm] = useState({ company: '', name: '', phone: '', email: '', items: '', note: '' });
  const [token, setToken] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await legacyRequest(
        'contact.create',
        {
          name: `${form.name} (${form.company})`,
          contact_phone: form.phone,
          email: form.email,
          message: `[ขอใบเสนอราคา]\nบริษัท: ${form.company}\nสินค้าที่ต้องการ:\n${form.items}\n\nเพิ่มเติม: ${form.note}`,
          'cf-turnstile-response': token,
        },
        'POST',
      );
      setNotice({ tone: 'ok', text: 'ส่งคำขอใบเสนอราคาแล้ว ทีมขายจะติดต่อกลับพร้อมใบเสนอราคาครับ' });
      setForm({ company: '', name: '', phone: '', email: '', items: '', note: '' });
      setToken('');
    } catch (x) {
      setNotice({ tone: 'bad', text: `ส่งไม่สำเร็จ: ${x instanceof LegacyApiError ? x.code : 'unknown'}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border bg-white p-5 shadow-sm sm:p-8">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-emerald-800 text-white">
          <FileText size={22} />
        </span>
        <div>
          <h2 className="text-xl font-black">ขอใบเสนอราคา</h2>
          <p className="text-sm text-slate-500">งานโครงการ/สั่งล็อตใหญ่ รับราคาพิเศษพร้อมใบเสนอราคา</p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="ชื่อบริษัท / หน่วยงาน" required>
          <Input
            required
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
            placeholder="เช่น บจก. ตัวอย่างก่อสร้าง"
          />
        </Field>
        <Field label="ชื่อผู้ติดต่อ" required>
          <Input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="เช่น สมชาย ใจดี"
            autoComplete="name"
          />
        </Field>
        <Field label="เบอร์โทร" required>
          <Input
            required
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="เช่น 0812345678"
            inputMode="tel"
            autoComplete="tel"
          />
        </Field>
        <Field label="อีเมล (รับใบเสนอราคา)">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="name@company.co.th"
            autoComplete="email"
          />
        </Field>
        <Field
          label="สินค้าที่ต้องการ"
          required
          hint="ระบุชื่อรุ่น + จำนวน เช่น สว่าน DCD796 จำนวน 10 ตัว"
          className="sm:col-span-2"
        >
          <Textarea
            required
            rows={5}
            value={form.items}
            onChange={(e) => setForm({ ...form, items: e.target.value })}
            placeholder={'สว่านโรตารี่ 26mm จำนวน 5 ตัว\nปั๊มน้ำอัตโนมัติ 400W จำนวน 2 ตัว'}
          />
        </Field>
        <Field label="รายละเอียดเพิ่มเติม" className="sm:col-span-2">
          <Textarea
            rows={3}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="หน้างานส่งที่ไหน ต้องการ VAT ใบกำกับภาษีหรือไม่ ฯลฯ"
          />
        </Field>
        <div className="sm:col-span-2">
          <Turnstile action="contact" onToken={setToken} />
        </div>
      </div>
      {notice && (
        <FormNotice tone={notice.tone} className="mt-4">
          {notice.text}
        </FormNotice>
      )}
      <Button disabled={busy} className="mt-5 w-full sm:w-auto" size="lg">
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            กำลังส่ง…
          </>
        ) : (
          'ส่งขอใบเสนอราคา'
        )}
      </Button>
    </form>
  );
}
