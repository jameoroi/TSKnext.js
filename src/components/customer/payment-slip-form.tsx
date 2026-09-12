'use client';
import { CircleCheck, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FormNotice } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { legacyRequest } from '@/lib/legacy-api.client';

const toDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

const CHECKLIST = [
  'ถ่ายให้เห็นวันเวลา ยอดเงิน และเลขอ้างอิงครบถ้วน',
  'โอนยอดให้ตรงกับที่แสดงในหน้าสรุปคำสั่งซื้อ',
  'เลขที่คำสั่งซื้อและรหัสติดตามอยู่ในอีเมลยืนยัน',
  'ทีมงานตรวจสอบภายในเวลาทำการ แล้วอัปเดตสถานะให้อัตโนมัติ',
];

function PaymentSlipInner() {
  const searchParams = useSearchParams();
  const [orderNo, setOrderNo] = useState(() => searchParams.get('order_no') || '');
  const [token, setToken] = useState(() => searchParams.get('token') || '');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(f: File | null) {
    setFile(f);
    setPreview(f ? await toDataUrl(f).catch(() => '') : '');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setMessage({ tone: 'bad', text: 'กรุณาแนบสลิปโอนเงิน' });
      return;
    }
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await legacyRequest(
        'payment.slip.upload',
        {
          order_no: orderNo,
          upload_token: token,
          image_data_url: preview || (await toDataUrl(file)),
          note: '',
        },
        'POST',
      );
      setMessage({ tone: 'ok', text: 'ส่งสลิปเรียบร้อยแล้ว ระบบจะแจ้งผลตามสถานะคำสั่งซื้อ' });
      setDone(true);
      setFile(null);
      setPreview('');
    } catch (err) {
      setMessage({
        tone: 'bad',
        text: err instanceof Error ? err.message : 'ส่งสลิปไม่สำเร็จ กรุณาตรวจเลขที่คำสั่งซื้อและรหัสติดตาม',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-12">
      <nav className="mb-4 flex items-center gap-1.5 text-sm text-slate-500" aria-label="เส้นทางหน้า">
        <Link href="/" className="hover:text-emerald-800">
          หน้าแรก
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-slate-700">ยืนยันการชำระเงิน</span>
      </nav>
      <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700">PAYMENT</p>
      <h1 className="mt-1 text-2xl font-bold sm:text-3xl">ยืนยันการชำระเงิน</h1>
      <p className="mt-2 text-sm text-slate-500">แนบสลิปโอนเงินเพื่อให้ทีมงานตรวจสอบและยืนยันคำสั่งซื้อของคุณ</p>

      <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border bg-white p-5 sm:p-6">
        <h2 className="font-bold">แนบสลิปโอนเงิน</h2>
        <Field label="เลขที่คำสั่งซื้อ" required>
          <Input
            value={orderNo}
            onChange={(e) => setOrderNo(e.target.value)}
            required
            placeholder="เช่น TSK-2026-000123"
            autoComplete="off"
          />
        </Field>
        <Field label="รหัสติดตาม / Token" required hint="อยู่ในอีเมลยืนยันหรือหน้าสรุปหลังสั่งซื้อ">
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            placeholder="วางโทเคนที่นี่"
            autoComplete="off"
          />
        </Field>
        <Field label="ไฟล์สลิป" required hint="PNG/JPEG/WebP/GIF เห็นยอด วันเวลา และเลขอ้างอิงชัด">
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => void onFile(e.target.files?.[0] || null)}
            required
          />
        </Field>
        {preview && (
          <img
            src={preview}
            alt="ตัวอย่างสลิปที่เลือก"
            className="block w-full max-w-65 rounded-xl border bg-slate-50"
          />
        )}
        {message && <FormNotice tone={message.tone}>{message.text}</FormNotice>}
        <Button disabled={busy || (!file && !done)} className="w-full sm:w-auto" size="lg">
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              กำลังส่ง…
            </>
          ) : (
            'ส่งสลิปตรวจสอบ'
          )}
        </Button>
      </form>

      <div className="mt-6 rounded-2xl border bg-white p-5 sm:p-6">
        <h2 className="font-bold">ก่อนแนบสลิป</h2>
        <ul className="mt-3 grid gap-2.5">
          {CHECKLIST.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-slate-600">
              <CircleCheck aria-hidden="true" className="mt-1 size-4 shrink-0 text-emerald-700" />
              {item}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/track-order"
            className="rounded-xl border px-4 py-2.5 text-sm font-bold hover:border-emerald-400"
          >
            ติดตามคำสั่งซื้อ
          </Link>
          <Link
            href="/contact"
            className="rounded-xl border px-4 py-2.5 text-sm font-bold hover:border-emerald-400"
          >
            ติดต่อทีมงาน
          </Link>
        </div>
      </div>
    </div>
  );
}

export function PaymentSlipForm() {
  return (
    <Suspense>
      <PaymentSlipInner />
    </Suspense>
  );
}
