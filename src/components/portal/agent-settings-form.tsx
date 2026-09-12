'use client';

import { KeyRound, Palette, Save, Search, Store, UserCog } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FormNotice, PasswordInput, Textarea } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';

type Row = Record<string, any>;
const fields = [
  ['store_bio', 'คำอธิบายร้าน', 'textarea'],
  ['avatar_url', 'Avatar URL', 'text'],
  ['theme_color', 'สีร้าน', 'color'],
  ['phone', 'เบอร์โทร', 'text'],
  ['address', 'ที่อยู่', 'textarea'],
  ['province', 'จังหวัด', 'text'],
  ['postal_code', 'รหัสไปรษณีย์', 'text'],
  ['line_oa_url', 'LINE OA URL', 'text'],
  ['facebook', 'Facebook URL', 'text'],
  ['tiktok', 'TikTok URL', 'text'],
  ['bank_name', 'ธนาคาร', 'text'],
  ['bank_account_name', 'ชื่อบัญชี', 'text'],
  ['bank_account_no', 'เลขบัญชี', 'text'],
] as const;

function code(error: unknown) {
  return error instanceof LegacyApiError ? error.code : 'unknown';
}

export function AgentSettingsForm({
  agent,
  csrf,
  initialCatalog,
}: {
  agent: Row;
  csrf: string;
  initialCatalog?: any;
}) {
  const [form, setForm] = useState({ ...agent });
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [catalog, setCatalog] = useState<any>(initialCatalog || { selected: [], candidates: [] });
  const [catalogQuery, setCatalogQuery] = useState('');
  const [password, setPassword] = useState({ old_password: '', new_password: '', confirm: '' });
  const selectedSet = useMemo(
    () =>
      new Set(
        (catalog.selected || []).map((value: any) =>
          typeof value === 'string' ? value : String(value?.id || ''),
        ),
      ),
    [catalog.selected],
  );

  async function saveProfile() {
    setBusy('profile');
    setNotice(null);
    try {
      const result = await legacyRequest<any>('agent.profile.update', { ...form, csrf }, 'POST');
      setForm((current) => ({ ...current, ...(result.agent || {}) }));
      setNotice({ tone: 'ok', text: 'บันทึกข้อมูลร้านเรียบร้อย' });
    } catch (error) {
      setNotice({ tone: 'bad', text: `ผิดพลาด: ${code(error)}` });
    } finally {
      setBusy('');
    }
  }

  async function loadCatalog(q = catalogQuery) {
    setBusy('catalog');
    setNotice(null);
    try {
      setCatalog(await legacyRequest<any>('agent.catalog.list', { q }));
    } catch (error) {
      setNotice({ tone: 'bad', text: `โหลดแคตตาล็อกไม่สำเร็จ: ${code(error)}` });
    } finally {
      setBusy('');
    }
  }

  async function toggleProduct(productId: string, selected: boolean) {
    setBusy(productId);
    setNotice(null);
    try {
      await legacyRequest(
        selected ? 'agent.catalog.remove' : 'agent.catalog.add',
        { product_ids: [productId], csrf },
        'POST',
      );
      await loadCatalog(catalogQuery);
      setNotice({ tone: 'ok', text: selected ? 'นำสินค้าออกจากหน้าร้านแล้ว' : 'เพิ่มสินค้าเข้าหน้าร้านแล้ว' });
    } catch (error) {
      setNotice({ tone: 'bad', text: `ผิดพลาด: ${code(error)}` });
    } finally {
      setBusy('');
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (password.new_password.length < 10)
      return setNotice({ tone: 'bad', text: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 10 ตัวอักษร' });
    if (password.new_password !== password.confirm)
      return setNotice({ tone: 'bad', text: 'ยืนยันรหัสผ่านใหม่ไม่ตรงกัน' });
    setBusy('password');
    try {
      await legacyRequest(
        'agent.password',
        { old_password: password.old_password, new_password: password.new_password, csrf },
        'POST',
      );
      setPassword({ old_password: '', new_password: '', confirm: '' });
      setNotice({ tone: 'ok', text: 'เปลี่ยนรหัสผ่านเรียบร้อย' });
    } catch (error) {
      setNotice({ tone: 'bad', text: `ผิดพลาด: ${code(error)}` });
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-6">
      {notice && <FormNotice tone={notice.tone}>{notice.text}</FormNotice>}

      <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-800">
            <UserCog size={21} />
          </span>
          <div>
            <h2 className="text-xl font-bold">ตั้งค่าร้านตัวแทน</h2>
            <p className="text-sm text-slate-500">โปรไฟล์ร้าน ช่องทางติดต่อ ธนาคาร และธีม</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {fields.map(([key, label, type]) => (
            <Field key={key} label={label} className={type === 'textarea' ? 'sm:col-span-2' : ''}>
              {type === 'textarea' ? (
                <Textarea
                  rows={key === 'store_bio' ? 4 : 3}
                  value={String(form[key] ?? '')}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              ) : (
                <Input
                  type={type}
                  value={String(form[key] ?? (type === 'color' ? '#0b2e22' : ''))}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className={type === 'color' ? 'cursor-pointer p-1' : undefined}
                />
              )}
            </Field>
          ))}
        </div>
        <Button disabled={Boolean(busy)} onClick={() => void saveProfile()} className="mt-5">
          <Save size={17} />
          {busy === 'profile' ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
        </Button>
      </section>

      <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-800">
              <Store size={21} />
            </span>
            <div>
              <h2 className="text-xl font-bold">สินค้าในหน้าร้าน</h2>
              <p className="text-sm text-slate-500">เลือกจากสินค้าหลักของบริษัท ราคาและสต็อกยังควบคุมโดยบริษัท</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
            เลือกแล้ว {selectedSet.size.toLocaleString('th-TH')} รายการ
          </span>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void loadCatalog();
          }}
          className="mt-5 flex gap-2"
          aria-label="ค้นหาสินค้าในแคตตาล็อก"
        >
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            <label className="sr-only" htmlFor="agent-catalog-q">
              ค้นหาสินค้า
            </label>
            <Input
              id="agent-catalog-q"
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder="ค้นหาชื่อสินค้า SKU หรือแบรนด์"
              className="pl-10"
            />
          </div>
          <Button variant="outline" disabled={busy === 'catalog'}>
            ค้นหา
          </Button>
        </form>
        <div className="mt-4 grid gap-2">
          {(catalog.candidates || []).map((product: Row) => {
            const selected = Boolean(product.selected) || selectedSet.has(String(product.id));
            return (
              <article
                key={String(product.id)}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
              >
                <div className="min-w-0">
                  <strong className="line-clamp-1 text-sm">{product.name}</strong>
                  <p className="mt-1 text-xs text-slate-500">
                    {product.sku || 'ไม่มี SKU'} · {product.brand || '—'} · ฿
                    {Number(product.price || 0).toLocaleString('th-TH')} · stock{' '}
                    {String(product.stock ?? '—')}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={selected ? 'outline' : 'default'}
                  disabled={Boolean(busy)}
                  onClick={() => void toggleProduct(String(product.id), selected)}
                >
                  {busy === String(product.id) ? 'กำลังบันทึก…' : selected ? 'นำออก' : 'เพิ่มเข้าร้าน'}
                </Button>
              </article>
            );
          })}
          {!(catalog.candidates || []).length && (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-400">ไม่พบสินค้า</p>
          )}
        </div>
      </section>

      <section className="grid items-start gap-6 lg:grid-cols-2">
        <form
          onSubmit={changePassword}
          className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6"
          noValidate
        >
          <div className="flex items-center gap-3">
            <KeyRound className="text-emerald-800" />
            <div>
              <h2 className="font-bold">เปลี่ยนรหัสผ่าน</h2>
              <p className="text-xs text-slate-500">อย่างน้อย 10 ตัวอักษร</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4">
            <Field label="รหัสผ่านเดิม" required>
              <PasswordInput
                required
                autoComplete="current-password"
                value={password.old_password}
                onChange={(e) => setPassword({ ...password, old_password: e.target.value })}
              />
            </Field>
            <Field label="รหัสผ่านใหม่" required hint="อย่างน้อย 10 ตัวอักษร">
              <PasswordInput
                required
                minLength={10}
                autoComplete="new-password"
                value={password.new_password}
                onChange={(e) => setPassword({ ...password, new_password: e.target.value })}
              />
            </Field>
            <Field label="ยืนยันรหัสผ่านใหม่" required>
              <PasswordInput
                required
                minLength={10}
                autoComplete="new-password"
                value={password.confirm}
                onChange={(e) => setPassword({ ...password, confirm: e.target.value })}
              />
            </Field>
            <div>
              <Button variant="outline" disabled={Boolean(busy)}>
                {busy === 'password' ? 'กำลังเปลี่ยน…' : 'เปลี่ยนรหัสผ่าน'}
              </Button>
            </div>
          </div>
        </form>
        <div className="rounded-3xl border bg-gradient-to-br from-slate-900 to-emerald-950 p-6 text-white">
          <Palette />
          <h2 className="mt-4 text-xl font-bold">หน้าร้านของคุณ</h2>
          <p className="mt-2 text-sm leading-6 text-white/65">
            สีร้าน ลิงก์ Social รูปโปรไฟล์ และคำอธิบายที่บันทึกด้านบนจะใช้กับ storefront ของตัวแทน โดยสินค้า ราคา
            และสต็อกยังดึงจากคลังหลักแบบสด
          </p>
          <div
            className="mt-4 h-2 rounded-full"
            style={{ backgroundColor: String(form.theme_color || '#0b2e22') }}
          />
        </div>
      </section>
    </div>
  );
}
