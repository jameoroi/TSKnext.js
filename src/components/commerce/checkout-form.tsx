'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Loader2, QrCode, TicketPercent } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { ProvinceCombobox } from '@/components/forms/province-combobox';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { readAgentRef } from '@/features/agent/referral';
import { cartSubtotal, useCartStore } from '@/features/cart/store';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';
import { trackMarketing } from '@/lib/marketing.client';
import { orderTotals } from '@/shared/shipping.mjs';
import { normaliseProvince } from '@/shared/th-provinces.mjs';

const schema = z.object({
  name: z.string().trim().min(2, 'กรุณากรอกชื่อผู้รับ'),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().min(9, 'เบอร์โทรอย่างน้อย 9 หลัก').max(15)),
  email: z.string().email('อีเมลไม่ถูกต้อง').or(z.literal('')),
  address: z.string().trim().min(10, 'กรุณากรอกที่อยู่ให้ครบ'),
  province: z
    .string()
    .trim()
    .min(2, 'กรุณาเลือกจังหวัด')
    .refine((v) => normaliseProvince(v) !== '', 'กรุณาเลือกจังหวัดจากรายการ'),
  zip: z.string().regex(/^\d{5}$/, 'รหัสไปรษณีย์ 5 หลัก'),
  payment_method: z.enum(['โอนเงิน/พร้อมเพย์', 'เก็บเงินปลายทาง (COD)', 'สั่งซื้อผ่าน LINE']),
  coupon_code: z.string().optional(),
  terms_accepted: z.literal(true, { error: 'กรุณายอมรับเงื่อนไข' }),
});

type FormValues = z.infer<typeof schema>;
type Address = {
  id: string;
  label?: string;
  name?: string;
  phone?: string;
  address?: string;
  province?: string;
  zip?: string;
  is_default?: boolean;
};
type PaymentSettings = {
  bank_transfer_enabled?: boolean;
  cod_enabled?: boolean;
  line_order_enabled?: boolean;
  line_oa_url?: string;
  line_oa_name?: string;
  promptpay_id?: string;
  promptpay_name?: string;
};
type BundleQuote = {
  ok: true;
  set: { id: string; name: string; slug?: string };
  eligible_subtotal: number;
  discount: number;
  discount_type: string;
  discount_value: number;
  token: string;
  expires_in: number;
};

const money = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(
    n || 0,
  );

export function CheckoutForm({
  signedIn,
  customer,
  addresses,
  payment,
  initialCoupon = '',
}: {
  signedIn: boolean;
  customer: Record<string, any> | null;
  addresses: Address[];
  payment: PaymentSettings;
  initialCoupon?: string;
}) {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const clear = useCartStore((s) => s.clear);
  const bundleClaim = useCartStore((s) => s.bundleClaim);
  const subtotal = cartSubtotal(items);
  const defaultAddress = addresses.find((a) => a.is_default) || addresses[0];
  const [coupon, setCoupon] = useState<any>(null);
  const [couponMessage, setCouponMessage] = useState('');
  const [serverError, setServerError] = useState('');
  const [result, setResult] = useState<Record<string, any> | null>(null);
  const [slip, setSlip] = useState<File | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrError, setQrError] = useState('');
  const [qrBusy, setQrBusy] = useState(false);
  const [qrNonce, setQrNonce] = useState(0);
  const [bundleQuote, setBundleQuote] = useState<BundleQuote | null>(null);
  const [bundleError, setBundleError] = useState('');
  const checkoutTracked = useRef(false);

  const totals = useMemo(
    () =>
      orderTotals(subtotal, {
        productDiscount: Number(coupon?.discount || 0) + Number(bundleQuote?.discount || 0),
        shippingDiscount: Number(coupon?.shipping_discount || 0),
      }),
    [bundleQuote, coupon, subtotal],
  );

  const paymentOptions = useMemo(
    () =>
      [
        payment.bank_transfer_enabled !== false ? 'โอนเงิน/พร้อมเพย์' : '',
        payment.cod_enabled !== false ? 'เก็บเงินปลายทาง (COD)' : '',
        payment.line_order_enabled ? 'สั่งซื้อผ่าน LINE' : '',
      ].filter(Boolean) as FormValues['payment_method'][],
    [payment],
  );

  const defaultPayment = paymentOptions[0] || 'โอนเงิน/พร้อมเพย์';
  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: String(defaultAddress?.name || customer?.name || ''),
      phone: String(defaultAddress?.phone || customer?.phone || ''),
      email: String(customer?.email || ''),
      address: String(defaultAddress?.address || customer?.address || ''),
      province: String(defaultAddress?.province || customer?.province || ''),
      zip: String(defaultAddress?.zip || customer?.zip || ''),
      payment_method: defaultPayment,
      coupon_code: initialCoupon,
      terms_accepted: false as unknown as true,
    },
  });
  const method = watch('payment_method');
  const couponCode = watch('coupon_code');
  const isTransfer = /โอนเงิน|พร้อมเพย์/.test(method || '');

  const requestBundleQuote = useCallback(async () => {
    if (!bundleClaim || !items.length) {
      setBundleQuote(null);
      setBundleError('');
      return null;
    }
    try {
      const response = await fetch('/api/kits/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          setId: bundleClaim.setId,
          items: items.map((item) => ({ id: item.id, variant_id: item.variant_id || '', qty: item.qty })),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(String(data?.error || `http_${response.status}`));
      const quote = data as BundleQuote;
      setBundleQuote(quote);
      setBundleError('');
      return quote;
    } catch (error) {
      setBundleQuote(null);
      const code = error instanceof Error ? error.message : 'bundle_quote_failed';
      setBundleError(
        code === 'kit_requirements_not_met'
          ? 'สินค้า Required ในชุดไม่ครบ จึงไม่ได้รับส่วนลดชุด'
          : `ตรวจส่วนลดชุดไม่ได้ (${code})`,
      );
      return null;
    }
  }, [bundleClaim, items]);

  useEffect(() => {
    void requestBundleQuote();
  }, [requestBundleQuote]);

  useEffect(() => {
    if (checkoutTracked.current || !items.length) return;
    checkoutTracked.current = true;
    trackMarketing('begin_checkout', {
      value: subtotal,
      items: items.map((item) => ({
        id: String(item.id),
        name: item.name,
        price: Number(item.price || 0),
        quantity: item.qty,
      })),
    });
  }, [items, subtotal]);

  useEffect(() => {
    if (!paymentOptions.includes(method)) setValue('payment_method', paymentOptions[0] || 'โอนเงิน/พร้อมเพย์');
  }, [method, paymentOptions, setValue]);

  const initialCouponApplied = useRef(false);

  useEffect(() => {
    // qrNonce is a manual-refresh trigger: read here so the effect re-runs on retry.
    void qrNonce;
    let cancelled = false;
    async function loadQr() {
      if (!isTransfer || !totals.total) {
        setQrDataUrl('');
        setQrError('');
        return;
      }
      setQrBusy(true);
      setQrError('');
      try {
        const qr = await legacyRequest<any>('payment.promptpay_qr', { amount: totals.total });
        if (!qr?.payload) throw new Error(qr?.qr_unavailable ? 'qr_unavailable' : 'empty_qr_payload');
        const data = await QRCode.toDataURL(String(qr.payload), {
          width: 300,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
        if (!cancelled) setQrDataUrl(data);
      } catch (error) {
        if (!cancelled) {
          setQrDataUrl('');
          setQrError(
            error instanceof LegacyApiError && error.code === 'promptpay_not_configured'
              ? 'ยังไม่ได้ตั้งค่าพร้อมเพย์'
              : 'สร้าง QR ไม่สำเร็จ กรุณาใช้เลขพร้อมเพย์ด้านล่าง',
          );
        }
      } finally {
        if (!cancelled) setQrBusy(false);
      }
    }
    void loadQr();
    return () => {
      cancelled = true;
    };
  }, [isTransfer, totals.total, qrNonce]);

  function chooseAddress(address: Address) {
    setValue('name', String(address.name || ''));
    setValue('phone', String(address.phone || ''));
    setValue('address', String(address.address || ''));
    setValue('province', String(address.province || ''));
    setValue('zip', String(address.zip || ''));
  }

  const applyCoupon = useCallback(
    async (value = couponCode || '') => {
      const code = String(value || '')
        .trim()
        .toUpperCase();
      if (!code) {
        setCoupon(null);
        setCouponMessage('');
        return;
      }
      setServerError('');
      setCouponMessage('');
      try {
        const currentTotals = orderTotals(subtotal);
        const data = await legacyRequest<any>('coupon.validate', {
          code,
          subtotal,
          shipping: currentTotals.baseShipping,
        });
        setCoupon(data);
        setValue('coupon_code', code);
        setCouponMessage(`ใช้คูปอง ${code} แล้ว`);
      } catch (error) {
        setCoupon(null);
        setCouponMessage('');
        setServerError(error instanceof LegacyApiError ? `คูปองใช้ไม่ได้: ${error.code}` : 'คูปองใช้ไม่ได้');
      }
    },
    [couponCode, subtotal, setValue],
  );

  useEffect(() => {
    if (!initialCoupon || initialCouponApplied.current) return;
    initialCouponApplied.current = true;
    void applyCoupon(initialCoupon);
  }, [initialCoupon, applyCoupon]);

  function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('file_read_failed'));
      reader.readAsDataURL(file);
    });
  }

  async function submit(values: FormValues) {
    setServerError('');
    const payloadItems = items.map((i) => ({
      id: i.id,
      variant_id: i.variant_id || '',
      variant_label: i.variant_label || '',
      sku: i.sku || '',
      name: i.name,
      qty: i.qty,
      price: i.price,
    }));
    try {
      await legacyRequest('checkout.stock.validate', { items: payloadItems }, 'POST');
      const freshBundleQuote = bundleClaim ? await requestBundleQuote() : null;
      const finalTotals = orderTotals(subtotal, {
        productDiscount: Number(coupon?.discount || 0) + Number(freshBundleQuote?.discount || 0),
        shippingDiscount: Number(coupon?.shipping_discount || 0),
      });
      const created = await legacyRequest<Record<string, any>>(
        'order.create',
        {
          ...values,
          coupon_code: String(values.coupon_code || '')
            .trim()
            .toUpperCase(),
          bundle_quote_token: freshBundleQuote?.token || '',
          total: finalTotals.total,
          items: payloadItems,
          terms_accepted: true,
          agent_ref: readAgentRef() || undefined,
        },
        'POST',
      );
      if (/โอนเงิน|พร้อมเพย์/.test(values.payment_method) && slip && created.order_no) {
        await legacyRequest(
          'payment.slip.upload',
          {
            order_no: created.order_no,
            image_data_url: await fileToDataUrl(slip),
            note: '',
            upload_token: created.upload_token || '',
          },
          'POST',
        );
      }
      trackMarketing('purchase', {
        value: Number(created.total || totals.total || 0),
        order_id: String(created.order_no || created.id || ''),
        items: payloadItems.map((item) => ({
          id: String(item.id),
          name: item.name,
          price: Number(item.price || 0),
          quantity: Number(item.qty || 1),
        })),
      });
      setResult(created);
      clear();
    } catch (error) {
      const code = error instanceof LegacyApiError ? error.code : 'unknown';
      if (code === 'login_required') {
        router.push(`/login?role=customer&redirect=${encodeURIComponent('/checkout')}`);
        return;
      }
      const map: Record<string, string> = {
        invalid_order: 'ข้อมูลผู้รับไม่ครบถ้วน',
        invalid_email: 'อีเมลไม่ถูกต้อง',
        insufficient_stock: 'สินค้าบางรายการมีไม่พอ',
        product_unavailable: 'สินค้าบางรายการไม่พร้อมจำหน่าย',
        variant_unavailable: 'ตัวเลือกสินค้าที่เลือกไม่พร้อมจำหน่าย',
        coupon_invalid: 'คูปองใช้ไม่ได้',
        payment_method_unavailable: 'ช่องทางชำระเงินนี้ไม่พร้อมใช้งาน',
        inventory_conflict: 'สต็อกมีการเปลี่ยนแปลง กรุณาลองใหม่',
        rate_limited: 'สั่งซื้อถี่เกินไป กรุณารอสักครู่',
        kit_quote_invalid: 'ส่วนลดชุดอุปกรณ์หมดอายุหรือสินค้าในชุดเปลี่ยน กรุณาตรวจตะกร้าอีกครั้ง',
      };
      setServerError(map[code] || code || 'สร้างคำสั่งซื้อไม่สำเร็จ');
    }
  }

  if (result)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-3xl border bg-white p-8 text-center">
          <CheckCircle2 className="mx-auto text-emerald-600" size={64} />
          <h1 className="mt-4 text-3xl font-bold">รับคำสั่งซื้อแล้ว</h1>
          <p className="mt-2 text-slate-500">เลขที่คำสั่งซื้อ</p>
          <strong className="mt-1 block text-xl">{String(result.order_no || result.id || '-')}</strong>
          <div className="mx-auto mt-6 max-w-sm rounded-2xl bg-emerald-50 p-5">
            <p className="text-sm">ยอดที่ต้องชำระ</p>
            <strong className="text-3xl text-emerald-950">
              {money(Number(result.total || totals.total))}
            </strong>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/verify-payment"
              className="rounded-xl bg-emerald-950 px-5 py-3 font-semibold text-white"
            >
              แนบสลิปภายหลัง
            </Link>
            <Link href="/account" className="rounded-xl border px-5 py-3 font-semibold">
              ดูคำสั่งซื้อ
            </Link>
          </div>
        </div>
      </div>
    );

  if (!items.length)
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">ไม่มีสินค้าในตะกร้า</h1>
        <Link href="/products" className="mt-5 inline-block text-emerald-800">
          กลับไปเลือกสินค้า
        </Link>
      </div>
    );

  if (!signedIn)
    return (
      <div className="mx-auto max-w-2xl px-4 py-20">
        <div className="rounded-3xl border bg-white p-8 text-center">
          <h1 className="text-3xl font-bold">เข้าสู่ระบบก่อนชำระเงิน</h1>
          <p className="mt-3 text-slate-500">ตะกร้าจะยังอยู่ในเบราว์เซอร์นี้ และคุณจะกลับมาหน้านี้หลังเข้าสู่ระบบ</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href={`/login?role=customer&redirect=${encodeURIComponent('/checkout')}`}
              className="rounded-xl bg-emerald-950 px-5 py-3 font-bold text-white"
            >
              เข้าสู่ระบบ
            </Link>
            <Link
              href={`/login?role=register&redirect=${encodeURIComponent('/checkout')}`}
              className="rounded-xl border px-5 py-3 font-bold"
            >
              สมัครสมาชิก
            </Link>
          </div>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 lg:px-6">
      <h1 className="text-3xl font-bold">ชำระเงิน</h1>
      <form onSubmit={handleSubmit(submit)} className="mt-7 grid gap-7 lg:grid-cols-[1fr_380px]">
        <section className="space-y-7">
          {addresses.length > 0 && (
            <div className="rounded-2xl border bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-bold">ที่อยู่ที่บันทึกไว้</h2>
                <Link href="/account?tab=addresses" className="text-xs font-bold text-emerald-800 tsk-link">
                  จัดการสมุดที่อยู่
                </Link>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {addresses.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => chooseAddress(a)}
                    className="min-w-52 rounded-xl border p-3 text-left text-sm hover:border-emerald-600"
                  >
                    <strong>{a.label || (a.is_default ? 'ที่อยู่หลัก' : 'ที่อยู่')}</strong>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                      {a.name} · {a.address} {a.province} {a.zip}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-2xl border bg-white p-5 sm:p-7">
            <h2 className="text-xl font-bold">ข้อมูลผู้รับสินค้า</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {(
                [
                  ['name', 'ชื่อผู้รับ', true],
                  ['phone', 'เบอร์โทร', true],
                  ['email', 'อีเมล', false],
                  ['zip', 'รหัสไปรษณีย์', true],
                ] as const
              ).map(([key, label, required]) => (
                <Field
                  key={key}
                  label={required ? label : `${label} (ไม่บังคับ)`}
                  required={required}
                  error={errors[key] ? String(errors[key]?.message || '') : undefined}
                >
                  <Input
                    aria-invalid={Boolean(errors[key])}
                    autoComplete={
                      key === 'name'
                        ? 'name'
                        : key === 'phone'
                          ? 'tel'
                          : key === 'email'
                            ? 'email'
                            : key === 'zip'
                              ? 'postal-code'
                              : undefined
                    }
                    inputMode={key === 'phone' || key === 'zip' ? 'numeric' : undefined}
                    {...register(key)}
                  />
                </Field>
              ))}
              <Field
                label="จังหวัด"
                required
                error={errors.province ? String(errors.province.message || '') : undefined}
              >
                <Controller
                  name="province"
                  control={control}
                  render={({ field }) => (
                    <ProvinceCombobox
                      id="checkout-province"
                      value={field.value}
                      invalid={Boolean(errors.province)}
                      onChange={(v) => field.onChange(v)}
                      onBlur={() => field.onBlur()}
                    />
                  )}
                />
              </Field>
              <Field label="ที่อยู่จัดส่ง" required error={errors.address?.message} className="sm:col-span-2">
                <Textarea
                  aria-invalid={Boolean(errors.address)}
                  autoComplete="street-address"
                  placeholder="บ้านเลขที่ หมู่ ซอย ถนน ตำบล/แขวง"
                  {...register('address')}
                />
              </Field>
            </div>
          </div>
          <fieldset className="rounded-2xl border bg-white p-5 sm:p-7">
            <legend className="px-1 text-xl font-bold">ช่องทางชำระเงิน</legend>
            {paymentOptions.length ? (
              <div className="grid gap-2">
                {paymentOptions.map((value) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${method === value ? 'border-emerald-600 bg-emerald-50' : 'hover:border-slate-400'}`}
                  >
                    <input
                      type="radio"
                      value={value}
                      {...register('payment_method')}
                      className="size-4 accent-emerald-800"
                    />
                    <span className="font-semibold">{value}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">
                ยังไม่ได้เปิดช่องทางชำระเงิน กรุณาติดต่อร้าน
              </p>
            )}
            {isTransfer && (
              <div className="mt-5 rounded-2xl bg-slate-50 p-5">
                <div className="flex items-center gap-2">
                  <QrCode size={20} />
                  <h3 className="font-bold">PromptPay</h3>
                </div>
                {qrBusy ? (
                  <p className="mt-4 text-sm text-slate-500">กำลังสร้าง QR…</p>
                ) : qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="PromptPay QR"
                    className="mx-auto mt-4 size-64 rounded-xl bg-white p-3"
                  />
                ) : null}
                {qrError && <p className="mt-3 text-center text-xs text-amber-700">{qrError}</p>}
                <div className="mt-3 text-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={qrBusy}
                    onClick={() => setQrNonce((n) => n + 1)}
                  >
                    {qrBusy ? 'กำลังสร้าง…' : qrDataUrl ? 'สร้าง QR ใหม่' : 'ลองสร้าง QR อีกครั้ง'}
                  </Button>
                </div>
                <div className="mt-3 text-center">
                  <strong>{payment.promptpay_name || 'PromptPay'}</strong>
                  <p className="font-mono text-sm">{payment.promptpay_id || '—'}</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-950">{money(totals.total)}</p>
                </div>
                <label className="mt-4 block" htmlFor="checkout-slip">
                  <span className="mb-1 block text-sm font-semibold">แนบสลิปตอนนี้ (ไม่บังคับ)</span>
                  <Input
                    id="checkout-slip"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => setSlip(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            )}
          </fieldset>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border bg-white p-5 text-sm">
            <input
              type="checkbox"
              {...register('terms_accepted')}
              aria-invalid={Boolean(errors.terms_accepted)}
              className="mt-1 size-4 shrink-0 accent-emerald-800"
            />
            <span>
              ฉันยอมรับ{' '}
              <Link className="font-semibold text-emerald-800 tsk-link" href="/terms">
                ข้อกำหนด
              </Link>{' '}
              และ{' '}
              <Link className="font-semibold text-emerald-800 tsk-link" href="/privacy">
                นโยบายความเป็นส่วนตัว
              </Link>
              {errors.terms_accepted && (
                <small role="alert" className="mt-1 block font-semibold text-rose-600">
                  {errors.terms_accepted.message}
                </small>
              )}
            </span>
          </label>
          {serverError && (
            <p
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700"
            >
              {serverError}
            </p>
          )}
        </section>
        <aside className="h-fit rounded-2xl border bg-white p-5 lg:sticky lg:top-28">
          <h2 className="text-xl font-bold">สรุปคำสั่งซื้อ</h2>
          {bundleClaim ? (
            <div
              className={`mt-4 rounded-xl border p-3 text-xs ${bundleQuote ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
            >
              <strong>ชุด: {bundleClaim.name}</strong>
              <p className="mt-1">
                {bundleQuote
                  ? `ยืนยันส่วนลดชุดแล้ว${bundleQuote.discount > 0 ? ` · -${money(bundleQuote.discount)}` : ''}`
                  : bundleError || 'กำลังตรวจส่วนลดชุด…'}
              </p>
            </div>
          ) : null}
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span>สินค้า ({items.reduce((n, i) => n + i.qty, 0)})</span>
              <span>{money(totals.subtotal)}</span>
            </div>
            {bundleQuote?.discount ? (
              <div className="flex justify-between text-emerald-700">
                <span>ส่วนลดชุดอุปกรณ์</span>
                <span>-{money(bundleQuote.discount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span>ค่าจัดส่ง</span>
              <span>{totals.payableShipping ? money(totals.payableShipping) : 'ฟรี'}</span>
            </div>
            {coupon && (
              <>
                <div className="flex justify-between text-emerald-700">
                  <span>ส่วนลดคูปอง</span>
                  <span>-{money(Number(coupon?.discount || 0))}</span>
                </div>
                {totals.shippingDiscount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>ส่วนลดค่าส่ง</span>
                    <span>-{money(totals.shippingDiscount)}</span>
                  </div>
                )}
              </>
            )}
            <div className="border-t pt-4">
              <div className="flex justify-between">
                <strong>ยอดรวม</strong>
                <strong className="text-2xl text-emerald-950">{money(totals.total)}</strong>
              </div>
            </div>
          </div>
          <div className="mt-5">
            <label className="mb-1 flex items-center gap-2 text-sm font-semibold" htmlFor="checkout-coupon">
              <TicketPercent size={16} />
              คูปอง
            </label>
            <div className="flex gap-2">
              <Input id="checkout-coupon" {...register('coupon_code')} placeholder="รหัสคูปอง" />
              <Button
                type="button"
                variant="outline"
                onClick={() => applyCoupon(getValues('coupon_code') || '')}
              >
                ใช้
              </Button>
            </div>
            {couponMessage && <p className="mt-2 text-xs font-semibold text-emerald-700">{couponMessage}</p>}
          </div>
          <Button
            type="submit"
            size="lg"
            className="mt-5 w-full"
            disabled={isSubmitting || paymentOptions.length === 0}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                กำลังสร้างคำสั่งซื้อ…
              </>
            ) : (
              'ยืนยันคำสั่งซื้อ'
            )}
          </Button>
        </aside>
      </form>
    </div>
  );
}
