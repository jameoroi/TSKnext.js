'use client';
import { Check, Copy, ExternalLink, Loader2, PackageSearch } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, FormNotice } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { legacyRequest } from '@/lib/legacy-api.client';
import { carrierName, needsPaste, trackingUrl } from '@/shared/carriers.mjs';

const STEPS = ['รอชำระเงิน', 'กำลังแพ็ค', 'จัดส่งแล้ว', 'สำเร็จ'];

function stepOf(status: unknown): number {
  const s = String(status || '').toLowerCase();
  if (/ยกเลิก|cancel/.test(s)) return -1;
  if (/สำเร็จ|complete|delivered/.test(s)) return 3;
  if (/จัดส่ง|ship/.test(s)) return 2;
  if (/แพ็ค|pack|paid|ชำระแล้ว/.test(s)) return 1;
  return 0;
}

type Parcel = { number: string; carrierName: string; url: string; paste: boolean };

function parcelsOf(order: any): Parcel[] {
  const rows = Array.isArray(order?.fulfillment) ? order.fulfillment : [];
  const list = rows.length
    ? rows.map((r: any) => ({
        number: String(r?.tracking_number || ''),
        carrier: r?.carrier || order?.carrier,
      }))
    : [{ number: String(order?.tracking_number || ''), carrier: order?.carrier }];
  return list
    .filter((r: any) => r.number)
    .map((r: any) => ({
      number: r.number,
      carrierName: carrierName(r.carrier),
      url: trackingUrl(r.carrier, r.number),
      paste: needsPaste(r.carrier),
    }));
}

function TrackOrderInner() {
  const searchParams = useSearchParams();
  const [orderNo, setOrderNo] = useState(() => searchParams.get('order_no') || '');
  const [token, setToken] = useState(() => searchParams.get('token') || '');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setData(null);
    try {
      setData(await legacyRequest('order.track', { order_no: orderNo, token }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่พบคำสั่งซื้อ หรือรหัสติดตามไม่ถูกต้อง');
    } finally {
      setBusy(false);
    }
  }

  async function copyNumber(n: string) {
    try {
      await navigator.clipboard.writeText(n);
      setCopied(n);
      window.setTimeout(() => setCopied((c) => (c === n ? '' : c)), 2000);
    } catch {
      /* ถูกปฏิเสธสิทธิ์ — เลขอยู่บนจอให้คัดลอกเองได้ */
    }
  }

  const order = data?.order || null;
  const step = order ? stepOf(order.status) : 0;
  const parcels = order ? parcelsOf(order) : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-12">
      <nav className="mb-4 flex items-center gap-1.5 text-sm text-slate-500" aria-label="เส้นทางหน้า">
        <Link href="/" className="hover:text-emerald-800">
          หน้าแรก
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-slate-700">ติดตามคำสั่งซื้อ</span>
      </nav>
      <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-700">TRACKING</p>
      <h1 className="mt-1 text-2xl font-bold sm:text-3xl">ติดตามคำสั่งซื้อ</h1>
      <p className="mt-2 text-sm text-slate-500">
        ลูกค้าที่เข้าสู่ระบบใช้เพียงเลขออเดอร์ หากไม่ได้เข้าสู่ระบบให้ใช้โทเคนจากหน้าสั่งซื้อด้วย
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border bg-white p-5 sm:p-6">
        <h2 className="font-bold">ตรวจสอบสถานะ</h2>
        <Field label="เลขที่คำสั่งซื้อ" required>
          <Input
            value={orderNo}
            onChange={(e) => setOrderNo(e.target.value)}
            required
            placeholder="เช่น TSK-2026-000123"
            autoComplete="off"
          />
        </Field>
        <Field label="Tracking token" hint="ไม่บังคับ — จำเป็นเฉพาะกรณีที่ไม่ได้เข้าสู่ระบบ">
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="โทเคนจากหน้าสั่งซื้อ (ถ้ามี)"
            autoComplete="off"
          />
        </Field>
        {error && <FormNotice tone="bad">{error}</FormNotice>}
        <Button disabled={busy} className="w-full sm:w-auto" size="lg">
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              กำลังตรวจสอบ…
            </>
          ) : (
            'ตรวจสอบสถานะ'
          )}
        </Button>
      </form>

      {order ? (
        <article className="mt-6 rounded-2xl border bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">ออเดอร์</p>
              <strong className="text-xl">{order.order_no}</strong>
            </div>
            <span className="h-fit rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
              {order.status}
            </span>
          </div>

          {step >= 0 ? (
            <ol className="mt-5 grid grid-cols-4 gap-1" aria-label="ความคืบหน้าคำสั่งซื้อ">
              {STEPS.map((label, i) => (
                <li key={label} className="text-center" aria-current={i === step ? 'step' : undefined}>
                  <span
                    aria-hidden="true"
                    className={`mx-auto grid size-8 place-items-center rounded-full text-sm font-black ${
                      i < step
                        ? 'bg-emerald-600 text-white'
                        : i === step
                          ? 'bg-emerald-800 text-white ring-4 ring-emerald-100'
                          : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {i < step ? '✓' : i + 1}
                  </span>
                  <span
                    className={`mt-1.5 block text-[11px] leading-4 ${i <= step ? 'font-bold text-emerald-900' : 'text-slate-400'}`}
                  >
                    {label}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700"
            >
              คำสั่งซื้อนี้ถูกยกเลิกแล้ว
            </p>
          )}

          <div className="mt-5 space-y-2 border-t pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">ยอดรวม</span>
              <strong>฿{Number(order.total || 0).toLocaleString('th-TH')}</strong>
            </div>
            {order.tracking_number && (
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">เลขพัสดุ</span>
                <strong>{order.tracking_number}</strong>
              </div>
            )}
          </div>

          {parcels.length > 0 && (
            <div className="mt-5 border-t pt-4">
              <h3 className="font-bold">ติดตามพัสดุ</h3>
              <div className="mt-3 space-y-3">
                {parcels.map((p) => (
                  <div key={p.number} className="rounded-xl border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-mono font-bold">{p.number}</p>
                        {p.carrierName && <p className="text-xs text-slate-500">{p.carrierName}</p>}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void copyNumber(p.number)}
                        >
                          {copied === p.number ? (
                            <>
                              <Check className="size-3.5" /> คัดลอกแล้ว
                            </>
                          ) : (
                            <>
                              <Copy className="size-3.5" /> คัดลอกเลข
                            </>
                          )}
                        </Button>
                        {p.url && (
                          <Link
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(buttonVariants({ size: 'sm' }))}
                          >
                            ดูสถานะพัสดุ <ExternalLink className="size-3.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                    {p.url && p.paste ? (
                      <p className="mt-2 text-xs text-slate-500">
                        กด “คัดลอกเลข” แล้วนำไปวางในช่องค้นหาของ {p.carrierName}
                      </p>
                    ) : !p.url ? (
                      <p className="mt-2 text-xs text-slate-500">
                        ยังไม่ได้ระบุขนส่ง — ติดต่อร้านเพื่อสอบถามสถานะได้เลย
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>
      ) : (
        <div className="mt-6 rounded-2xl border bg-white p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-bold">
            <PackageSearch className="size-5 text-emerald-800" />
            หาเลขที่คำสั่งซื้อไม่เจอ?
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            เลขที่คำสั่งซื้อและรหัสติดตามอยู่ในอีเมลยืนยัน หรือหน้าสรุปหลังสั่งซื้อ หากเข้าสู่ระบบไว้ ดูได้จากบัญชีของฉัน
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/account"
              className="rounded-xl border px-4 py-2.5 text-sm font-bold hover:border-emerald-400"
            >
              ไปที่บัญชีของฉัน
            </Link>
            <Link
              href="/contact"
              className="rounded-xl border px-4 py-2.5 text-sm font-bold hover:border-emerald-400"
            >
              ติดต่อทีมงาน
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function TrackOrderForm() {
  return (
    <Suspense>
      <TrackOrderInner />
    </Suspense>
  );
}
