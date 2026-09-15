'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  CheckCircle2,
  Link2,
  LockKeyhole,
  LogOut,
  MapPin,
  MessageCircle,
  PackageSearch,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Unlink,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getProviders, signIn, signOut } from 'next-auth/react';
import { Tabs } from 'radix-ui';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { legacyRequest } from '@/lib/legacy-api.client';

type AccountProps = {
  initialSession: any;
  initialOrders: any[];
  initialAddresses: any[];
  initialTab?: Tab;
};

type Tab = 'orders' | 'profile' | 'addresses' | 'chat' | 'security';

const tabs: Array<{ key: Tab; label: string; icon: typeof UserRound }> = [
  { key: 'orders', label: 'คำสั่งซื้อ', icon: PackageSearch },
  { key: 'profile', label: 'ข้อมูลส่วนตัว', icon: UserRound },
  { key: 'addresses', label: 'สมุดที่อยู่', icon: MapPin },
  { key: 'chat', label: 'ประวัติแชท', icon: MessageCircle },
  { key: 'security', label: 'ความปลอดภัย', icon: ShieldCheck },
];

const money = (value: unknown) =>
  Number(value || 0).toLocaleString('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  });
const dateText = (value: unknown, withTime = false) => {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '';
  return withTime
    ? date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
    : date.toLocaleDateString('th-TH', { dateStyle: 'medium' });
};

function errorText(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const map: Record<string, string> = {
    invalid_input: 'กรอกข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง',
    email_or_phone_exists: 'อีเมลหรือเบอร์โทรนี้ถูกใช้งานแล้ว',
    invalid_password: 'รหัสผ่านเดิมไม่ถูกต้อง',
    weak_password: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 10 ตัวอักษร',
    invalid_csrf: 'เซสชันหมดอายุ กรุณารีเฟรชหน้าแล้วลองอีกครั้ง',
    return_exists: 'ออเดอร์นี้มีคำขอคืนสินค้าอยู่แล้ว',
    order_not_eligible: 'สถานะออเดอร์นี้ไม่สามารถยื่นขอคืนสินค้าได้',
    not_found: 'ไม่พบข้อมูลที่ระบุ',
    unauthorized: 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง',
    login_required: 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง',
    cannot_unlink_last_login: 'ต้องตั้งรหัสผ่านหรือเชื่อม Social อีกบัญชีก่อน จึงจะยกเลิกช่องทางเข้าสู่ระบบสุดท้ายได้',
  };
  return map[code] || (code ? `ดำเนินการไม่สำเร็จ (${code})` : 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
}

function StatusBadge({ status }: { status: unknown }) {
  const text = String(status || 'รอดำเนินการ');
  const tone = /cancel|ยกเลิก|refunded|คืนเงิน/i.test(text)
    ? 'bg-rose-50 text-rose-700'
    : /complete|delivered|จัดส่งแล้ว|สำเร็จ/i.test(text)
      ? 'bg-emerald-50 text-emerald-700'
      : /pending|รอ|wait/i.test(text)
        ? 'bg-amber-50 text-amber-800'
        : 'bg-slate-100 text-slate-700';
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{text}</span>;
}

export function AccountView({
  initialSession,
  initialOrders,
  initialAddresses,
  initialTab = 'orders',
}: AccountProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [notice, setNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [profile, setProfile] = useState(() => ({
    name: String(initialSession?.customer?.name || ''),
    email: String(initialSession?.customer?.email || ''),
    phone: String(initialSession?.customer?.phone || ''),
    address: String(initialSession?.customer?.address || ''),
    province: String(initialSession?.customer?.province || ''),
    zip: String(initialSession?.customer?.zip || ''),
  }));
  const emptyAddress = () => ({
    id: '',
    label: 'ที่อยู่จัดส่ง',
    name: '',
    phone: '',
    address: '',
    province: '',
    zip: '',
    is_default: false,
  });
  const [addressForm, setAddressForm] = useState(emptyAddress);
  const [passwordForm, setPasswordForm] = useState({ old_password: '', new_password: '', confirm: '' });
  const [returnForm, setReturnForm] = useState({ order_no: '', reason: '' });
  const [socialProviders, setSocialProviders] = useState<Array<'google' | 'facebook' | 'line'>>([]);
  const [socialBusy, setSocialBusy] = useState('');

  useEffect(() => {
    let alive = true;
    void getProviders()
      .then((providers) => {
        if (!alive) return;
        const enabled = (['google', 'facebook', 'line'] as const).filter((provider) =>
          Boolean(providers?.[provider]),
        );
        setSocialProviders([...enabled]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => legacyRequest<any>('session'),
    initialData: initialSession,
    staleTime: 30_000,
  });
  const orders = useQuery({
    queryKey: ['customer.orders'],
    queryFn: () => legacyRequest<any>('customer.orders'),
    initialData: { ok: true, orders: initialOrders },
  });
  const addresses = useQuery({
    queryKey: ['customer.addresses'],
    queryFn: () => legacyRequest<any>('customer.addresses.list'),
    initialData: { ok: true, addresses: initialAddresses },
  });
  const chat = useQuery({
    queryKey: ['customer.chat.mine'],
    queryFn: () => legacyRequest<any>('telegram.chat.mine'),
    enabled: activeTab === 'chat',
    staleTime: 15_000,
  });

  const customer = session.data?.customer || initialSession?.customer || {};
  const csrf = String(session.data?.csrf || initialSession?.csrf || '');
  const orderRows = Array.isArray(orders.data?.orders) ? orders.data.orders : [];
  const addressRows = Array.isArray(addresses.data?.addresses) ? addresses.data.addresses : [];
  const totalSpend = useMemo(
    () => orderRows.reduce((sum: number, row: any) => sum + Number(row?.total || 0), 0),
    [orderRows],
  );

  const mutate = useMutation({
    mutationFn: async ({ action, payload }: { action: string; payload?: Record<string, unknown> }) =>
      legacyRequest<any>(action, { ...(payload || {}), csrf }, 'POST'),
    onError: (error) => setNotice({ type: 'error', text: errorText(error) }),
  });

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    try {
      const result = await mutate.mutateAsync({ action: 'customer.profile', payload: profile });
      queryClient.setQueryData(['session'], (current: any) => ({
        ...(current || {}),
        customer: result.customer || profile,
      }));
      setNotice({ type: 'ok', text: 'บันทึกข้อมูลส่วนตัวแล้ว' });
      router.refresh();
    } catch {}
  }

  async function saveAddress(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    try {
      const result = await mutate.mutateAsync({ action: 'customer.addresses.save', payload: addressForm });
      queryClient.setQueryData(['customer.addresses'], { ok: true, addresses: result.addresses || [] });
      setAddressForm(emptyAddress());
      setNotice({ type: 'ok', text: 'บันทึกที่อยู่แล้ว' });
    } catch {}
  }

  async function deleteAddress(id: string) {
    if (!window.confirm('ลบที่อยู่นี้ออกจากสมุดที่อยู่?')) return;
    setNotice(null);
    try {
      const result = await mutate.mutateAsync({ action: 'customer.addresses.delete', payload: { id } });
      queryClient.setQueryData(['customer.addresses'], { ok: true, addresses: result.addresses || [] });
      if (addressForm.id === id) setAddressForm(emptyAddress());
      setNotice({ type: 'ok', text: 'ลบที่อยู่แล้ว' });
    } catch {}
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (passwordForm.new_password.length < 10) {
      setNotice({ type: 'error', text: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 10 ตัวอักษร' });
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm) {
      setNotice({ type: 'error', text: 'ยืนยันรหัสผ่านใหม่ไม่ตรงกัน' });
      return;
    }
    try {
      const result = await mutate.mutateAsync({
        action: 'customer.password',
        payload: { old_password: passwordForm.old_password, new_password: passwordForm.new_password },
      });
      if (result.customer)
        queryClient.setQueryData(['session'], (current: any) => ({
          ...(current || {}),
          customer: result.customer,
        }));
      setPasswordForm({ old_password: '', new_password: '', confirm: '' });
      setNotice({
        type: 'ok',
        text:
          customer?.auth_mode === 'oauth' ? 'ตั้งรหัสผ่านแล้ว ตอนนี้เข้าสู่ระบบได้ทั้งรหัสผ่านและ Social' : 'เปลี่ยนรหัสผ่านแล้ว',
      });
    } catch {}
  }

  async function requestReturn(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    try {
      await mutate.mutateAsync({ action: 'customer.return.request', payload: returnForm });
      setReturnForm({ order_no: '', reason: '' });
      await queryClient.invalidateQueries({ queryKey: ['customer.orders'] });
      setNotice({ type: 'ok', text: 'ส่งคำขอคืนสินค้าแล้ว ทีมงานจะติดต่อกลับ' });
    } catch {}
  }

  async function linkSocial(provider: 'google' | 'facebook' | 'line') {
    setNotice(null);
    setSocialBusy(provider);
    try {
      await signIn(provider, { redirectTo: '/api/auth/legacy-bridge?redirect=%2Faccount' });
    } catch {
      setSocialBusy('');
      setNotice({ type: 'error', text: 'เริ่มเชื่อมบัญชี Social ไม่สำเร็จ กรุณาลองใหม่' });
    }
  }

  async function unlinkSocial(provider: 'google' | 'facebook' | 'line') {
    if (
      !window.confirm(
        `ยกเลิกการเชื่อม ${provider === 'google' ? 'Google' : provider === 'facebook' ? 'Facebook' : 'LINE'}?`,
      )
    )
      return;
    setNotice(null);
    setSocialBusy(provider);
    try {
      const result = await mutate.mutateAsync({ action: 'customer.oauth.unlink', payload: { provider } });
      if (result.customer)
        queryClient.setQueryData(['session'], (current: any) => ({
          ...(current || {}),
          customer: result.customer,
        }));
      setNotice({ type: 'ok', text: 'ยกเลิกการเชื่อมบัญชีแล้ว' });
      router.refresh();
    } catch {
    } finally {
      setSocialBusy('');
    }
  }

  async function logout() {
    setNotice(null);
    try {
      await legacyRequest('customer.logout', {}, 'POST');
    } catch {}
    try {
      await signOut({ redirect: false });
    } catch {}
    queryClient.clear();
    window.location.assign('/');
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 lg:px-6 lg:py-10">
      <nav className="mb-5 text-sm text-slate-500">
        <Link href="/">หน้าแรก</Link> <span className="mx-1">›</span> บัญชีของฉัน
      </nav>

      <section className="rounded-3xl border bg-white p-5 shadow-sm lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-full bg-emerald-100 text-xl font-black text-emerald-900">
              {String(customer?.name || customer?.email || 'ส')
                .trim()
                .slice(0, 1)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">{customer?.name || 'สมาชิก THAISERKIT'}</h1>
              <p className="truncate text-sm text-slate-500">{customer?.email || customer?.phone || ''}</p>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-3 gap-3 sm:flex sm:flex-none sm:gap-8">
            <div>
              <strong className="block text-lg">{orderRows.length.toLocaleString('th-TH')}</strong>
              <span className="text-xs text-slate-500">คำสั่งซื้อ</span>
            </div>
            <div>
              <strong className="block text-lg">{money(totalSpend)}</strong>
              <span className="text-xs text-slate-500">ยอดซื้อสะสม</span>
            </div>
            <div>
              <strong className="block text-lg">{addressRows.length.toLocaleString('th-TH')}</strong>
              <span className="text-xs text-slate-500">ที่อยู่</span>
            </div>
          </div>
          <Button variant="outline" onClick={logout} disabled={mutate.isPending}>
            <LogOut size={17} />
            ออกจากระบบ
          </Button>
        </div>
      </section>

      <Tabs.Root
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as Tab);
          setNotice(null);
        }}
        className="mt-5 overflow-x-auto rounded-2xl border bg-white p-1.5"
      >
        <Tabs.List className="flex min-w-max gap-1" aria-label="เมนูบัญชี">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Tabs.Trigger
                key={tab.key}
                value={tab.key}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${activeTab === tab.key ? 'bg-emerald-950 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <Icon size={16} />
                {tab.label}
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>
      </Tabs.Root>

      {notice && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          className={`mt-4 flex items-center gap-2 rounded-2xl border p-4 text-sm font-semibold ${notice.type === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}
        >
          {notice.type === 'ok' ? <CheckCircle2 size={18} /> : <RotateCcw size={18} />} {notice.text}
        </div>
      )}

      {activeTab === 'orders' && (
        <section className="mt-5 space-y-3" role="tabpanel">
          {orderRows.length ? (
            orderRows.map((order: any) => (
              <article
                key={String(order.id || order.order_no)}
                className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
              >
                <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                  <div>
                    <strong className="text-base">{order.order_no || order.id}</strong>
                    <p className="mt-1 text-xs text-slate-500">
                      {dateText(order.created_at || order.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                  <strong className="text-lg text-emerald-950">{money(order.total)}</strong>
                  <Link
                    href={`/track-order?order_no=${encodeURIComponent(String(order.order_no || ''))}`}
                    className="rounded-xl border px-4 py-2 text-center text-sm font-semibold hover:bg-slate-50"
                  >
                    ติดตาม
                  </Link>
                </div>
              </article>
            ))
          ) : (
            <Empty title="ยังไม่มีคำสั่งซื้อ">
              <Link className="font-semibold text-emerald-800 tsk-link" href="/products">
                เริ่มเลือกซื้อสินค้า
              </Link>
            </Empty>
          )}
        </section>
      )}

      {activeTab === 'profile' && (
        <section className="mt-5" role="tabpanel">
          <form onSubmit={saveProfile} className="tsk-form rounded-3xl border bg-white p-5 shadow-sm lg:p-6">
            <div className="mb-5 flex items-center gap-3">
              <UserRound className="text-emerald-800" />
              <div>
                <h2 className="text-xl font-bold">ข้อมูลส่วนตัว</h2>
                <p className="text-sm text-slate-500">ใช้สำหรับติดต่อและออกเอกสารคำสั่งซื้อ</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="ชื่อ-นามสกุล">
                <input
                  required
                  autoComplete="name"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                />
              </Field>
              <Field label="อีเมล">
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                />
              </Field>
              <Field label="เบอร์โทร">
                <input
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                />
              </Field>
              <Field label="จังหวัด">
                <input
                  value={profile.province}
                  onChange={(e) => setProfile({ ...profile, province: e.target.value })}
                />
              </Field>
              <Field label="รหัสไปรษณีย์">
                <input
                  inputMode="numeric"
                  value={profile.zip}
                  onChange={(e) => setProfile({ ...profile, zip: e.target.value })}
                />
              </Field>
              <Field label="ที่อยู่" className="md:col-span-2 xl:col-span-1 2xl:col-span-2">
                <textarea
                  rows={3}
                  value={profile.address}
                  onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                />
              </Field>
            </div>
            <Button className="mt-5" disabled={mutate.isPending}>
              <Save size={17} />
              {mutate.isPending ? 'กำลังบันทึก…' : 'บันทึกโปรไฟล์'}
            </Button>
          </form>
        </section>
      )}

      {activeTab === 'addresses' && (
        <section className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_.9fr]" role="tabpanel">
          <div className="space-y-3">
            <h2 className="px-1 text-lg font-bold">ที่อยู่ที่บันทึกไว้</h2>
            {addressRows.length ? (
              addressRows.map((address: any) => (
                <article key={String(address.id)} className="rounded-2xl border bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>{address.label || 'ที่อยู่จัดส่ง'}</strong>
                        {address.is_default && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                            ค่าเริ่มต้น
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-700">
                        {address.name} · {address.phone}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        {address.address} {address.province} {address.zip}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setAddressForm({
                            id: String(address.id || ''),
                            label: String(address.label || ''),
                            name: String(address.name || ''),
                            phone: String(address.phone || ''),
                            address: String(address.address || ''),
                            province: String(address.province || ''),
                            zip: String(address.zip || ''),
                            is_default: Boolean(address.is_default),
                          })
                        }
                        className="rounded-lg border p-2 hover:bg-slate-50"
                        aria-label="แก้ไข"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteAddress(String(address.id))}
                        className="rounded-lg border p-2 text-rose-700 hover:bg-rose-50"
                        aria-label="ลบ"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <Empty title="ยังไม่มีที่อยู่จัดส่ง" />
            )}
          </div>

          <form
            onSubmit={saveAddress}
            className="tsk-form h-fit rounded-3xl border bg-white p-5 shadow-sm lg:p-6"
          >
            <div className="mb-5 flex items-center gap-3">
              {addressForm.id ? (
                <Pencil className="text-emerald-800" />
              ) : (
                <Plus className="text-emerald-800" />
              )}
              <div>
                <h2 className="text-xl font-bold">{addressForm.id ? 'แก้ไขที่อยู่' : 'เพิ่มที่อยู่ใหม่'}</h2>
                <p className="text-sm text-slate-500">เลือกเป็นค่าเริ่มต้นได้หนึ่งรายการ</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Field label="ชื่อเรียก">
                <input
                  value={addressForm.label}
                  onChange={(e) => setAddressForm({ ...addressForm, label: e.target.value })}
                  placeholder="บ้าน / ที่ทำงาน"
                />
              </Field>
              <Field label="ชื่อผู้รับ">
                <input
                  required
                  value={addressForm.name}
                  onChange={(e) => setAddressForm({ ...addressForm, name: e.target.value })}
                />
              </Field>
              <Field label="เบอร์โทร">
                <input
                  required
                  inputMode="tel"
                  value={addressForm.phone}
                  onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                />
              </Field>
              <Field label="จังหวัด">
                <input
                  value={addressForm.province}
                  onChange={(e) => setAddressForm({ ...addressForm, province: e.target.value })}
                />
              </Field>
              <Field label="รหัสไปรษณีย์">
                <input
                  inputMode="numeric"
                  value={addressForm.zip}
                  onChange={(e) => setAddressForm({ ...addressForm, zip: e.target.value })}
                />
              </Field>
              <Field label="ที่อยู่" className="md:col-span-2 xl:col-span-1 2xl:col-span-2">
                <textarea
                  required
                  rows={3}
                  value={addressForm.address}
                  onChange={(e) => setAddressForm({ ...addressForm, address: e.target.value })}
                />
              </Field>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={addressForm.is_default}
                onChange={(e) => setAddressForm({ ...addressForm, is_default: e.target.checked })}
                className="size-4"
              />
              ใช้เป็นที่อยู่เริ่มต้น
            </label>
            <div className="mt-5 flex gap-2">
              <Button disabled={mutate.isPending}>
                <Save size={17} />
                บันทึกที่อยู่
              </Button>
              {addressForm.id && (
                <Button type="button" variant="outline" onClick={() => setAddressForm(emptyAddress())}>
                  ยกเลิก
                </Button>
              )}
            </div>
          </form>
        </section>
      )}

      {activeTab === 'chat' && (
        <section className="mt-5 space-y-4" role="tabpanel">
          <div className="rounded-2xl border bg-white p-5">
            <div className="flex items-center gap-3">
              <MessageCircle className="text-emerald-800" />
              <div>
                <h2 className="font-bold">ประวัติการแชทกับทีมงาน</h2>
                <p className="text-sm text-slate-500">แชทของบัญชีเก็บย้อนหลังตามนโยบายระบบ และเปิดดูจากอุปกรณ์อื่นได้</p>
              </div>
            </div>
          </div>
          {chat.isPending ? (
            <Empty title="กำลังโหลดประวัติแชท…" />
          ) : chat.isError ? (
            <Empty title="โหลดประวัติแชทไม่สำเร็จ">
              <button
                type="button"
                className="font-semibold text-emerald-800 tsk-link"
                onClick={() => void chat.refetch()}
              >
                ลองอีกครั้ง
              </button>
            </Empty>
          ) : (chat.data?.conversations || []).length ? (
            (chat.data.conversations || []).map((room: any) => (
              <article key={String(room.id)} className="rounded-2xl border bg-white p-5 shadow-sm">
                <header className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <strong>คุยเมื่อ {dateText(room.updated_at || room.created_at, true)}</strong>
                    <p className="text-xs text-slate-500">
                      {Number(room.message_count || 0).toLocaleString('th-TH')} ข้อความ
                    </p>
                  </div>
                  <StatusBadge status={room.status === 'open' ? 'กำลังคุยอยู่' : 'จบการสนทนาแล้ว'} />
                </header>
                <div className="mt-4 space-y-2">
                  {(room.messages || []).map((item: any) => (
                    <div
                      key={String(item.id || `${item.created_at}-${item.text}`)}
                      className={`flex ${item.role === 'customer' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${item.role === 'customer' ? 'rounded-br-sm bg-emerald-100 text-emerald-950' : 'rounded-bl-sm bg-slate-100 text-slate-800'}`}
                      >
                        <p className="whitespace-pre-wrap break-words">{item.text}</p>
                        <small className="mt-1 block text-[10px] opacity-60">
                          {item.role === 'admin' ? item.sender || 'ทีมงาน' : 'คุณ'} ·{' '}
                          {dateText(item.created_at, true)}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))
          ) : (
            <Empty title="ยังไม่มีประวัติแชท" />
          )}
        </section>
      )}

      {activeTab === 'security' && (
        <section className="mt-5 grid gap-5 lg:grid-cols-2" role="tabpanel">
          <form
            onSubmit={changePassword}
            className="tsk-form rounded-3xl border bg-white p-5 shadow-sm lg:p-6"
          >
            <div className="mb-5 flex items-center gap-3">
              <LockKeyhole className="text-emerald-800" />
              <div>
                <h2 className="text-xl font-bold">
                  {customer?.auth_mode === 'oauth' ? 'ตั้งรหัสผ่าน' : 'เปลี่ยนรหัสผ่าน'}
                </h2>
                <p className="text-sm text-slate-500">รหัสผ่านใหม่อย่างน้อย 10 ตัวอักษร</p>
              </div>
            </div>
            <div className="space-y-4">
              {customer?.auth_mode !== 'oauth' && (
                <Field label="รหัสผ่านเดิม">
                  <input
                    required
                    type="password"
                    autoComplete="current-password"
                    value={passwordForm.old_password}
                    onChange={(e) => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
                  />
                </Field>
              )}
              <Field label="รหัสผ่านใหม่">
                <input
                  required
                  minLength={10}
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                />
              </Field>
              <Field label="ยืนยันรหัสผ่านใหม่">
                <input
                  required
                  minLength={10}
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                />
              </Field>
            </div>
            <Button className="mt-5" disabled={mutate.isPending}>
              <LockKeyhole size={17} />
              {customer?.auth_mode === 'oauth' ? 'ตั้งรหัสผ่าน' : 'เปลี่ยนรหัสผ่าน'}
            </Button>
          </form>

          <article className="rounded-3xl border bg-white p-5 shadow-sm lg:p-6">
            <div className="mb-5 flex items-center gap-3">
              <Link2 className="text-emerald-800" />
              <div>
                <h2 className="text-xl font-bold">บัญชี Social</h2>
                <p className="text-sm text-slate-500">เชื่อมช่องทางสำรองเพื่อเข้าสู่ระบบได้เร็วขึ้น</p>
              </div>
            </div>
            {socialProviders.length ? (
              <div className="space-y-3">
                {socialProviders.map((provider) => {
                  const linked =
                    Array.isArray(customer?.oauth_providers) && customer.oauth_providers.includes(provider);
                  const label =
                    provider === 'google' ? 'Google' : provider === 'facebook' ? 'Facebook' : 'LINE';
                  return (
                    <div
                      key={provider}
                      className="flex items-center justify-between gap-3 rounded-2xl border p-3"
                    >
                      <div>
                        <strong className="text-sm">{label}</strong>
                        <p className="text-xs text-slate-500">{linked ? 'เชื่อมกับบัญชีนี้แล้ว' : 'ยังไม่ได้เชื่อม'}</p>
                      </div>
                      {linked ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={Boolean(socialBusy)}
                          onClick={() => void unlinkSocial(provider)}
                        >
                          <Unlink size={15} />
                          ยกเลิก
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={Boolean(socialBusy)}
                          onClick={() => void linkSocial(provider)}
                        >
                          <Link2 size={15} />
                          {socialBusy === provider ? 'กำลังเชื่อม…' : 'เชื่อม'}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                ยังไม่ได้ตั้งค่า Google / Facebook / LINE OAuth ในระบบ
              </p>
            )}
          </article>

          <form
            onSubmit={requestReturn}
            className="tsk-form rounded-3xl border bg-white p-5 shadow-sm lg:p-6 lg:col-span-2"
          >
            <div className="mb-5 flex items-center gap-3">
              <RotateCcw className="text-emerald-800" />
              <div>
                <h2 className="text-xl font-bold">ขอคืนสินค้า</h2>
                <p className="text-sm text-slate-500">ส่งคำขอให้ทีมงานตรวจสอบก่อนดำเนินการคืน</p>
              </div>
            </div>
            <div className="space-y-4">
              <Field label="เลขที่คำสั่งซื้อ">
                <input
                  required
                  list="customer-order-nos"
                  value={returnForm.order_no}
                  onChange={(e) => setReturnForm({ ...returnForm, order_no: e.target.value })}
                />
                <datalist id="customer-order-nos">
                  {orderRows.map((order: any) => (
                    <option key={String(order.order_no || order.id)} value={String(order.order_no || '')} />
                  ))}
                </datalist>
              </Field>
              <Field label="เหตุผล">
                <textarea
                  required
                  rows={5}
                  value={returnForm.reason}
                  onChange={(e) => setReturnForm({ ...returnForm, reason: e.target.value })}
                />
              </Field>
            </div>
            <Button className="mt-5" variant="outline" disabled={mutate.isPending}>
              <RotateCcw size={17} />
              ส่งคำขอคืนสินค้า
            </Button>
          </form>
        </section>
      )}

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <QuickLink href="/wishlist" icon={BookOpen} title="รายการโปรด" text="สินค้าที่บันทึกไว้" />
        <QuickLink href="/track-order" icon={PackageSearch} title="ติดตามออเดอร์" text="เช็กสถานะและเลขพัสดุ" />
        <QuickLink href="/verify-payment" icon={CheckCircle2} title="แจ้งชำระเงิน" text="แนบหลักฐานการโอน" />
      </section>
    </main>
  );
}

function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">
      <p>{title}</p>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  text,
}: {
  href: string;
  icon: typeof BookOpen;
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border bg-white p-4 transition hover:border-emerald-300 hover:shadow-sm"
    >
      <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-800">
        <Icon size={19} />
      </span>
      <span>
        <strong className="block text-sm">{title}</strong>
        <small className="text-slate-500">{text}</small>
      </span>
    </Link>
  );
}
