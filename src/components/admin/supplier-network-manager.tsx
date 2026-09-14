'use client';

import {
  BadgeCheck,
  Boxes,
  CircleDollarSign,
  KeyRound,
  Link2,
  PencilLine,
  Plus,
  RefreshCcw,
  Save,
  Search,
  ShieldAlert,
  Store,
  Truck,
  UserCog,
} from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';

type Row = Record<string, any>;

type SupplierDraft = {
  id: string;
  name: string;
  code: string;
  email: string;
  logo_url: string;
  description: string;
  categories: string;
  fulfillment_sla_days: string;
  settlement_terms_days: string;
  status: 'active' | 'paused' | 'inactive';
};

const EMPTY_SUPPLIER: SupplierDraft = {
  id: '',
  name: '',
  code: '',
  email: '',
  logo_url: '',
  description: '',
  categories: '',
  fulfillment_sla_days: '2',
  settlement_terms_days: '15',
  status: 'active',
};

const baht = (value: unknown) =>
  `฿${Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
const when = (value: unknown) =>
  value ? new Date(String(value)).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

function friendly(error: unknown) {
  const key =
    error instanceof LegacyApiError ? error.code : error instanceof Error ? error.message : 'unknown_error';
  const messages: Record<string, string> = {
    forbidden_super_admin_only: 'เมนู Supplier Network ใช้ได้เฉพาะ Super Admin',
    unauthorized: 'เซสชันหมดอายุหรือไม่มีสิทธิ์ดำเนินการ',
    invalid_csrf: 'CSRF token ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่',
    supplier_name_required: 'กรุณากรอกชื่อ Supplier',
    invalid_supplier_email: 'รูปแบบอีเมล Supplier ไม่ถูกต้อง',
    invalid_supplier_credentials: 'อีเมลหรือรหัสผ่านชั่วคราวไม่ถูกต้อง รหัสผ่านต้องยาวอย่างน้อย 10 ตัวอักษร',
    supplier_email_taken: 'อีเมลนี้ถูกใช้กับ Supplier อื่นแล้ว',
    supplier_not_active: 'ต้องเปิด Supplier เป็น active ก่อนจึงจะ assign สินค้าได้',
    product_ids_required: 'กรุณาเลือกสินค้าอย่างน้อย 1 รายการ',
    settlement_not_found: 'ไม่พบ Settlement นี้',
    invalid_operation: 'คำสั่ง Settlement ไม่ถูกต้อง',
  };
  return messages[key] || key;
}

function draftOf(row?: Row | null): SupplierDraft {
  if (!row) return { ...EMPTY_SUPPLIER };
  return {
    id: String(row.id || ''),
    name: String(row.name || ''),
    code: String(row.code || ''),
    email: String(row.email || ''),
    logo_url: String(row.logo_url || ''),
    description: String(row.description || ''),
    categories: Array.isArray(row.categories) ? row.categories.join(', ') : String(row.categories || ''),
    fulfillment_sla_days: String(row.fulfillment_sla_days ?? 0),
    settlement_terms_days: String(row.settlement_terms_days ?? 0),
    status: ['active', 'paused', 'inactive'].includes(String(row.status)) ? row.status : 'active',
  };
}

export function SupplierNetworkManager({
  initialSuppliers,
  initialSettlements,
  initialProducts,
  csrf,
  initialWarnings = [],
}: {
  initialSuppliers: Row[];
  initialSettlements: Row[];
  initialProducts: Row[];
  csrf: string;
  initialWarnings?: string[];
}) {
  const [suppliers, setSuppliers] = useState<Row[]>(initialSuppliers);
  const [settlements, setSettlements] = useState<Row[]>(initialSettlements);
  const [products, setProducts] = useState<Row[]>(initialProducts);
  const [supplierDraft, setSupplierDraft] = useState<SupplierDraft>(EMPTY_SUPPLIER);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const [credentialEmail, setCredentialEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [settlementRefs, setSettlementRefs] = useState<Record<string, string>>({});
  const [settlementNotes, setSettlementNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(
    initialWarnings.length ? `บางแหล่งข้อมูล Supplier ยังไม่พร้อม: ${initialWarnings.join(', ')}` : '',
  );

  const activeSupplier = useMemo(
    () => suppliers.find((row) => String(row.id) === selectedSupplier) || null,
    [selectedSupplier, suppliers],
  );
  const assignedCount = useMemo(
    () => products.reduce((sum, product) => sum + (product.supplier_id ? 1 : 0), 0),
    [products],
  );
  const pendingSettlements = useMemo(
    () =>
      settlements.filter((row) =>
        ['pending', 'ready_to_remit', 'on_hold'].includes(String(row.status || '')),
      ),
    [settlements],
  );
  const outstanding = useMemo(
    () => pendingSettlements.reduce((sum, row) => sum + Number(row.product_cost || 0), 0),
    [pendingSettlements],
  );
  const filteredProducts = useMemo(() => {
    const needle = productQuery.trim().toLowerCase();
    if (!needle) return products.slice(0, 250);
    return products
      .filter((row) =>
        [row.name, row.sku, row.id, row.supplier_name].some((value) =>
          String(value || '')
            .toLowerCase()
            .includes(needle),
        ),
      )
      .slice(0, 250);
  }, [productQuery, products]);

  function clearMessages() {
    setNotice('');
    setError('');
  }

  async function reload() {
    setBusy('reload');
    clearMessages();
    try {
      const [supplierData, settlementData, productData] = await Promise.all([
        legacyRequest<any>('admin.suppliers.list'),
        legacyRequest<any>('admin.settlements.list'),
        legacyRequest<any>('admin.products.list', { per_page: 500 }),
      ]);
      setSuppliers(Array.isArray(supplierData.suppliers) ? supplierData.suppliers : []);
      setSettlements(Array.isArray(settlementData.settlements) ? settlementData.settlements : []);
      setProducts(Array.isArray(productData.products) ? productData.products : []);
      setNotice('รีเฟรช Supplier Network แล้ว');
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  async function saveSupplier(event: FormEvent) {
    event.preventDefault();
    setBusy('supplier-save');
    clearMessages();
    try {
      const answer = await legacyRequest<any>(
        'admin.suppliers.save',
        {
          id: supplierDraft.id || undefined,
          name: supplierDraft.name.trim(),
          code: supplierDraft.code.trim(),
          email: supplierDraft.email.trim(),
          logo_url: supplierDraft.logo_url.trim(),
          description: supplierDraft.description.trim(),
          categories: supplierDraft.categories
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
          fulfillment_sla_days: Number(supplierDraft.fulfillment_sla_days || 0),
          settlement_terms_days: Number(supplierDraft.settlement_terms_days || 0),
          status: supplierDraft.status,
          csrf,
        },
        'POST',
      );
      const saved = answer.supplier;
      setSuppliers((current) => [saved, ...current.filter((row) => String(row.id) !== String(saved.id))]);
      setSupplierDraft(draftOf(saved));
      setSelectedSupplier(String(saved.id));
      setCredentialEmail(String(saved.email || ''));
      setNotice(`บันทึก Supplier ${saved.name || ''} แล้ว`);
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  function editSupplier(row: Row) {
    setSupplierDraft(draftOf(row));
    setSelectedSupplier(String(row.id || ''));
    setCredentialEmail(String(row.email || ''));
    setTemporaryPassword('');
    clearMessages();
  }

  function newSupplier() {
    setSupplierDraft({ ...EMPTY_SUPPLIER });
    setSelectedSupplier('');
    setCredentialEmail('');
    setTemporaryPassword('');
    clearMessages();
  }

  async function saveCredentials(event: FormEvent) {
    event.preventDefault();
    if (!selectedSupplier) {
      setError('กรุณาเลือก Supplier ก่อน');
      return;
    }
    if (temporaryPassword.length < 10) {
      setError('รหัสผ่านชั่วคราวต้องยาวอย่างน้อย 10 ตัวอักษร');
      return;
    }
    setBusy('credentials');
    clearMessages();
    try {
      await legacyRequest(
        'admin.suppliers.credentials',
        {
          supplier_id: selectedSupplier,
          email: credentialEmail.trim(),
          temporary_password: temporaryPassword,
          csrf,
        },
        'POST',
      );
      setTemporaryPassword('');
      setNotice('ตั้งค่า Supplier Login แล้ว ผู้ใช้จะถูกบังคับเปลี่ยนรหัสผ่านหลังเข้าสู่ระบบ');
      await reload();
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  async function assignProducts() {
    if (!selectedSupplier) {
      setError('กรุณาเลือก Supplier');
      return;
    }
    if (!selectedProducts.length) {
      setError('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ');
      return;
    }
    setBusy('assign');
    clearMessages();
    try {
      const answer = await legacyRequest<any>(
        'admin.suppliers.assign_products',
        {
          supplier_id: selectedSupplier,
          product_ids: selectedProducts,
          csrf,
        },
        'POST',
      );
      setNotice(
        `Assign สินค้า ${Number(answer.updated?.length || selectedProducts.length).toLocaleString('th-TH')} รายการแล้ว`,
      );
      setSelectedProducts([]);
      await reload();
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  async function settlementAction(row: Row, operation: 'mark_ready' | 'mark_remitted' | 'hold' | 'void') {
    const id = String(row.id || '');
    if (!id) return;
    if (operation === 'void' && !window.confirm(`ยืนยัน Void settlement ${id}?`)) return;
    if (operation === 'mark_remitted' && !String(settlementRefs[id] || '').trim()) {
      setError('กรุณากรอกเลขอ้างอิงการโอนก่อน Mark Remitted');
      return;
    }
    setBusy(`settlement:${id}`);
    clearMessages();
    try {
      const answer = await legacyRequest<any>(
        'admin.settlements.action',
        {
          id,
          operation,
          reference: String(settlementRefs[id] || '').trim(),
          note: String(settlementNotes[id] || '').trim(),
          csrf,
        },
        'POST',
      );
      const saved = answer.settlement;
      setSettlements((current) => current.map((item) => (String(item.id) === id ? saved : item)));
      setNotice(`อัปเดต Settlement ${id} เป็น ${saved.status || operation} แล้ว`);
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy('');
    }
  }

  function toggleProduct(id: string) {
    setSelectedProducts((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  return (
    <div className="space-y-6">
      {notice && (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {notice}
        </p>
      )}
      {error && (
        <p
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={<Store size={18} />}
            label="Supplier"
            value={String(suppliers.length)}
            note="ทุกสถานะ"
          />
          <Metric
            icon={<BadgeCheck size={18} />}
            label="Active"
            value={String(suppliers.filter((row) => row.status === 'active').length)}
            note="พร้อมรับงาน"
          />
          <Metric
            icon={<Boxes size={18} />}
            label="Assigned Products"
            value={String(assignedCount)}
            note="สินค้าที่ผูก Supplier"
          />
          <Metric
            icon={<CircleDollarSign size={18} />}
            label="Outstanding"
            value={baht(outstanding)}
            note={`${pendingSettlements.length} settlements`}
          />
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={busy === 'reload'}
          className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-black"
        >
          <RefreshCcw size={15} className={busy === 'reload' ? 'animate-spin' : ''} />
          รีเฟรช
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-black">Supplier Profile</h2>
              <p className="mt-1 text-xs text-slate-500">
                Fulfillment SLA, settlement terms และสถานะการรับงาน
              </p>
            </div>
            <button
              type="button"
              onClick={newSupplier}
              className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-black"
            >
              <Plus size={14} />
              เพิ่ม Supplier
            </button>
          </div>
          <form onSubmit={saveSupplier} className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="ชื่อ Supplier *">
              <input
                required
                value={supplierDraft.name}
                onChange={(e) => setSupplierDraft((d) => ({ ...d, name: e.target.value }))}
                className="input"
              />
            </Field>
            <Field label="Code">
              <input
                value={supplierDraft.code}
                onChange={(e) => setSupplierDraft((d) => ({ ...d, code: e.target.value.toUpperCase() }))}
                className="input"
                placeholder="AUTO ถ้าเว้นว่าง"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={supplierDraft.email}
                onChange={(e) => setSupplierDraft((d) => ({ ...d, email: e.target.value }))}
                className="input"
              />
            </Field>
            <Field label="สถานะ">
              <select
                value={supplierDraft.status}
                onChange={(e) =>
                  setSupplierDraft((d) => ({ ...d, status: e.target.value as SupplierDraft['status'] }))
                }
                className="input"
              >
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="inactive">inactive</option>
              </select>
            </Field>
            <Field label="Fulfillment SLA (วัน)">
              <input
                type="number"
                min="0"
                max="60"
                value={supplierDraft.fulfillment_sla_days}
                onChange={(e) => setSupplierDraft((d) => ({ ...d, fulfillment_sla_days: e.target.value }))}
                className="input"
              />
            </Field>
            <Field label="Settlement Terms (วัน)">
              <input
                type="number"
                min="0"
                max="90"
                value={supplierDraft.settlement_terms_days}
                onChange={(e) => setSupplierDraft((d) => ({ ...d, settlement_terms_days: e.target.value }))}
                className="input"
              />
            </Field>
            <Field label="หมวดหมู่ที่ดูแล" wide>
              <input
                value={supplierDraft.categories}
                onChange={(e) => setSupplierDraft((d) => ({ ...d, categories: e.target.value }))}
                className="input"
                placeholder="เครื่องมือไฟฟ้า, ปั๊มน้ำ, ..."
              />
            </Field>
            <Field label="Logo URL" wide>
              <input
                value={supplierDraft.logo_url}
                onChange={(e) => setSupplierDraft((d) => ({ ...d, logo_url: e.target.value }))}
                className="input"
              />
            </Field>
            <Field label="รายละเอียด" wide>
              <textarea
                rows={3}
                value={supplierDraft.description}
                onChange={(e) => setSupplierDraft((d) => ({ ...d, description: e.target.value }))}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
            </Field>
            <button
              disabled={busy === 'supplier-save'}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-950 px-4 py-3 text-sm font-black text-white sm:col-span-2"
            >
              <Save size={15} />
              {busy === 'supplier-save'
                ? 'กำลังบันทึก…'
                : supplierDraft.id
                  ? 'บันทึกการแก้ไข Supplier'
                  : 'สร้าง Supplier'}
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b p-5">
            <h2 className="font-black">Supplier Directory</h2>
            <p className="mt-1 text-xs text-slate-500">เลือก Supplier เพื่อแก้ไข credentials หรือ assign สินค้า</p>
          </div>
          <div className="max-h-[700px] overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">SLA</th>
                  <th className="px-4 py-3">Settlement</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-t ${selectedSupplier === String(row.id) ? 'bg-emerald-50/60' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <strong>{row.name}</strong>
                      <p className="mt-1 text-[10px] text-slate-400">{row.code || row.id}</p>
                    </td>
                    <td className="px-4 py-3">{row.email || '—'}</td>
                    <td className="px-4 py-3">{Number(row.fulfillment_sla_days || 0)} วัน</td>
                    <td className="px-4 py-3">{Number(row.settlement_terms_days || 0)} วัน</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-black ${row.status === 'active' ? 'bg-emerald-50 text-emerald-700' : row.status === 'paused' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}
                      >
                        {row.status || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => editSupplier(row)}
                        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-black"
                      >
                        <PencilLine size={13} />
                        จัดการ
                      </button>
                    </td>
                  </tr>
                ))}
                {!suppliers.length && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-slate-400">
                      ยังไม่มี Supplier
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[.75fr_1.25fr]">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <KeyRound size={17} className="text-emerald-700" />
            <div>
              <h2 className="font-black">Supplier Login / Credentials</h2>
              <p className="text-xs text-slate-500">ตั้ง temporary password ใหม่แบบ owner-only</p>
            </div>
          </div>
          {activeSupplier ? (
            <form onSubmit={saveCredentials} className="mt-4 space-y-3">
              <div className="rounded-xl bg-slate-50 p-3 text-sm">
                <strong>{activeSupplier.name}</strong>
                <p className="mt-1 text-xs text-slate-500">{activeSupplier.code || activeSupplier.id}</p>
              </div>
              <Field label="Email">
                <input
                  type="email"
                  required
                  value={credentialEmail}
                  onChange={(e) => setCredentialEmail(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Temporary password (10+)">
                <input
                  type="password"
                  minLength={10}
                  required
                  value={temporaryPassword}
                  onChange={(e) => setTemporaryPassword(e.target.value)}
                  className="input"
                  autoComplete="new-password"
                />
              </Field>
              <button
                disabled={busy === 'credentials'}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
              >
                <UserCog size={15} />
                {busy === 'credentials' ? 'กำลังบันทึก…' : 'ตั้งค่า Login ใหม่'}
              </button>
              <p className="text-[10px] leading-5 text-slate-500">
                ระบบเก็บ password hash เท่านั้น และ Supplier จะถูกบังคับเปลี่ยนรหัสผ่านเมื่อเข้าใช้งานครั้งถัดไป
              </p>
            </form>
          ) : (
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              เลือก Supplier จากตารางก่อน
            </p>
          )}
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link2 size={17} className="text-emerald-700" />
              <div>
                <h2 className="font-black">Assign Products</h2>
                <p className="text-xs text-slate-500">ผูกสินค้าให้ Supplier รับผิดชอบ fulfillment และ settlement</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void assignProducts()}
              disabled={busy === 'assign' || !selectedSupplier || !selectedProducts.length}
              className="rounded-xl bg-emerald-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40"
            >
              Assign {selectedProducts.length.toLocaleString('th-TH')} รายการ
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <select
              value={selectedSupplier}
              onChange={(e) => {
                setSelectedSupplier(e.target.value);
                const row = suppliers.find((s) => String(s.id) === e.target.value);
                setCredentialEmail(String(row?.email || ''));
              }}
              className="h-10 rounded-xl border bg-white px-3 text-sm font-bold"
            >
              <option value="">— เลือก Supplier —</option>
              {suppliers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} ({row.status})
                </option>
              ))}
            </select>
            <label className="relative min-w-[240px] flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="ค้นหาชื่อ / SKU / Product ID"
                className="h-10 w-full rounded-xl border pl-9 pr-3 text-sm"
              />
            </label>
          </div>
          <div className="mt-3 max-h-[430px] overflow-auto rounded-xl border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="w-12 px-3 py-2"></th>
                  <th className="px-3 py-2">สินค้า</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Supplier ปัจจุบัน</th>
                  <th className="px-3 py-2 text-right">Stock</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((row) => {
                  const id = String(row.id || '');
                  const checked = selectedProducts.includes(id);
                  return (
                    <tr key={id} className={`border-t ${checked ? 'bg-emerald-50/60' : ''}`}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProduct(id)}
                          aria-label={`เลือก ${row.name || id}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <strong>{row.name || id}</strong>
                        <p className="mt-1 text-[10px] text-slate-400">{id}</p>
                      </td>
                      <td className="px-3 py-2">
                        <code className="text-xs">{row.sku || '—'}</code>
                      </td>
                      <td className="px-3 py-2">{row.supplier_name || '—'}</td>
                      <td className="px-3 py-2 text-right font-black">
                        {Number(row.stock || 0).toLocaleString('th-TH')}
                      </td>
                    </tr>
                  );
                })}
                {!filteredProducts.length && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">
                      ไม่พบสินค้า
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section
        id="settlements"
        className="overflow-hidden rounded-2xl border bg-white shadow-sm scroll-mt-24"
      >
        <div className="border-b p-5">
          <div className="flex items-center gap-2">
            <CircleDollarSign size={18} className="text-emerald-700" />
            <div>
              <h2 className="font-black">Supplier Settlement Ledger</h2>
              <p className="mt-1 text-xs text-slate-500">
                mark ready → remitted, หรือ hold/void พร้อม audit trail
              </p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">Settlement</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3 text-right">Product Cost</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reference / Note</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((row) => {
                const id = String(row.id || '');
                return (
                  <tr key={id} className="border-t align-top">
                    <td className="px-4 py-3">
                      <code className="text-xs">{id}</code>
                      <p className="mt-1 text-[10px] text-slate-400">{when(row.created_at)}</p>
                    </td>
                    <td className="px-4 py-3 font-bold">{row.supplier_name || row.supplier_id || '—'}</td>
                    <td className="px-4 py-3">
                      <code className="text-xs">{row.order_no || row.order_id || '—'}</code>
                    </td>
                    <td className="px-4 py-3 text-right font-black">{baht(row.product_cost)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-black ${row.status === 'remitted' ? 'bg-emerald-50 text-emerald-700' : row.status === 'on_hold' ? 'bg-amber-50 text-amber-700' : row.status === 'void' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'}`}
                      >
                        {row.status || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={settlementRefs[id] ?? String(row.remittance_reference || '')}
                        onChange={(e) =>
                          setSettlementRefs((current) => ({ ...current, [id]: e.target.value }))
                        }
                        className="h-9 w-48 rounded-lg border px-2 text-xs"
                        placeholder="Reference"
                      />
                      <input
                        value={settlementNotes[id] ?? String(row.note || '')}
                        onChange={(e) =>
                          setSettlementNotes((current) => ({ ...current, [id]: e.target.value }))
                        }
                        className="mt-1 h-9 w-48 rounded-lg border px-2 text-xs"
                        placeholder="Note"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-[260px] flex-wrap gap-1">
                        <button
                          disabled={busy === `settlement:${id}`}
                          onClick={() => void settlementAction(row, 'mark_ready')}
                          className="rounded-lg border px-2 py-1.5 text-xs font-bold"
                        >
                          Ready
                        </button>
                        <button
                          disabled={busy === `settlement:${id}`}
                          onClick={() => void settlementAction(row, 'mark_remitted')}
                          className="rounded-lg bg-emerald-950 px-2 py-1.5 text-xs font-bold text-white"
                        >
                          Remitted
                        </button>
                        <button
                          disabled={busy === `settlement:${id}`}
                          onClick={() => void settlementAction(row, 'hold')}
                          className="rounded-lg border px-2 py-1.5 text-xs font-bold text-amber-700"
                        >
                          Hold
                        </button>
                        <button
                          disabled={busy === `settlement:${id}`}
                          onClick={() => void settlementAction(row, 'void')}
                          className="rounded-lg border px-2 py-1.5 text-xs font-bold text-rose-700"
                        >
                          Void
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!settlements.length && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-400">
                    ยังไม่มี Settlement
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50/30 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert size={20} className="mt-0.5 shrink-0 text-amber-700" />
          <div>
            <h2 className="font-black text-amber-950">Financial controls</h2>
            <p className="mt-1 text-xs leading-5 text-amber-900/70">
              Supplier credentials, settlement และ product assignment เป็น owner-only actions ฝั่ง API ตรวจ role
              + CSRF ซ้ำทุกครั้ง การ Mark Remitted ควรทำหลังโอนเงินจริงและกรอก reference แล้วเท่านั้น
            </p>
          </div>
        </div>
      </section>

      <style
        jsx
      >{`.input{margin-top:.25rem;height:2.75rem;width:100%;border-radius:.75rem;border:1px solid rgb(226 232 240);padding:0 .75rem;font-size:.875rem;background:white}`}</style>
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`text-xs font-bold text-slate-600 ${wide ? 'sm:col-span-2' : ''}`}>
      {label}
      {children}
    </label>
  );
}

function Metric({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-500">{label}</p>
        <span className="text-emerald-700">{icon}</span>
      </div>
      <strong className="mt-2 block text-xl font-black text-slate-950">{value}</strong>
      <p className="mt-1 text-[10px] text-slate-400">{note}</p>
    </article>
  );
}
