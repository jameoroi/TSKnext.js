'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { legacyRequest } from '@/lib/legacy-api.client';

type ProviderStatus = {
  connected: boolean;
  shop_id?: string | null;
  seller_id?: string | null;
  error?: string | null;
};
type ImportPreview = {
  source?: string;
  source_id?: string;
  name?: string;
  sku?: string;
  brand?: string;
  category?: string;
  price?: number;
  stock?: number;
  mapping_status?: string;
  mapping_notes?: string[];
  images?: string[];
};

function extractMarketplaceItems(payload: any): any[] {
  const visited = new Set<any>();
  const candidates: any[][] = [];
  const walk = (value: any, depth = 0) => {
    if (!value || depth > 8 || visited.has(value)) return;
    if (typeof value === 'object') visited.add(value);
    if (Array.isArray(value)) {
      const rows = value.filter((item) => item && typeof item === 'object');
      if (rows.length) candidates.push(rows);
      for (const item of value.slice(0, 20)) walk(item, depth + 1);
      return;
    }
    if (typeof value === 'object') for (const child of Object.values(value)) walk(child, depth + 1);
  };
  walk(payload);
  const scored = candidates
    .map((rows) => ({
      rows,
      score: rows
        .slice(0, 12)
        .reduce(
          (total, row) =>
            total +
            ['item_id', 'id', 'name', 'item_name', 'sku', 'price', 'stock', 'quantity'].filter(
              (key) => row?.[key] != null,
            ).length,
          0,
        ),
    }))
    .sort((a, b) => b.score - a.score || b.rows.length - a.rows.length);
  return scored[0]?.rows || [];
}

async function marketplace<T = any>(action: string, body?: Record<string, unknown>): Promise<T> {
  const response = body
    ? await fetch('/api/marketplace', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      })
    : await fetch(`/api/marketplace?action=${encodeURIComponent(action)}`, { credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) throw new Error(String(data?.error || `http_${response.status}`));
  return data as T;
}

const MARKETPLACE_ERRORS: Record<string, string> = {
  shopee_not_configured: 'ยังไม่ได้ตั้ง Partner ID / Partner Key ของ Shopee',
  lazada_not_configured: 'ยังไม่ได้ตั้ง App Key / App Secret ของ Lazada',
  not_connected: 'ยังไม่ได้เชื่อมต่อร้าน กรุณาเชื่อมต่อ OAuth ก่อน',
  unauthorized: 'ไม่มีสิทธิ์ใช้งาน Marketplace',
  invalid_csrf: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  product_not_found: 'ไม่พบสินค้านี้ใน Catalog',
  marketplace_not_configured: 'Marketplace ยังไม่ได้ตั้งค่าในระบบ',
};

function marketplaceMessage(error: unknown) {
  const code = error instanceof Error ? error.message : String(error || 'marketplace_error');
  return MARKETPLACE_ERRORS[code] || code;
}

export function MarketplaceManager({
  initialShopee,
  initialLazada,
  csrf,
}: {
  initialShopee: ProviderStatus;
  initialLazada: ProviderStatus;
  csrf: string;
}) {
  const [shopee, setShopee] = useState(initialShopee);
  const [lazada, setLazada] = useState(initialLazada);
  const [rows, setRows] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [importSource, setImportSource] = useState<'shopee' | 'lazada'>('shopee');
  const [remoteItems, setRemoteItems] = useState<any[]>([]);
  const [previewItems, setPreviewItems] = useState<ImportPreview[]>([]);
  const [publishImport, setPublishImport] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.id, row.name, row.sku, row.shopee_item_id, row.lazada_item_id].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(needle),
      ),
    );
  }, [query, rows]);

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function run(key: string, success: string, fn: () => Promise<void>) {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
      if (success) setNotice({ kind: 'ok', text: success });
    } catch (error) {
      setNotice({ kind: 'bad', text: marketplaceMessage(error) });
    } finally {
      setBusy('');
    }
  }

  const refreshStatus = () =>
    run('status', '', async () => {
      const [sp, lz] = await Promise.allSettled([
        marketplace<any>('shopee.status'),
        marketplace<any>('lazada.status'),
      ]);
      if (sp.status === 'fulfilled')
        setShopee({
          connected: Boolean(sp.value?.connected),
          shop_id: sp.value?.shop_id || null,
          error: sp.value?.error ? marketplaceMessage(new Error(String(sp.value.error))) : null,
        });
      else setShopee({ connected: false, error: marketplaceMessage(sp.reason) });
      if (lz.status === 'fulfilled')
        setLazada({
          connected: Boolean(lz.value?.connected),
          seller_id: lz.value?.seller_id || null,
          error: lz.value?.error ? marketplaceMessage(new Error(String(lz.value.error))) : null,
        });
      else setLazada({ connected: false, error: marketplaceMessage(lz.reason) });
    });

  const connect = (provider: 'shopee' | 'lazada') =>
    run(`connect-${provider}`, '', async () => {
      const res = await marketplace<{ url?: string }>(`${provider}.auth_url`);
      if (!res.url) throw new Error(`${provider}_auth_url_missing`);
      window.location.assign(res.url);
    });

  const loadProducts = () =>
    run('rows', '', async () => {
      const res = await marketplace<any>('products.list');
      setRows(Array.isArray(res?.products) ? res.products : Object.values(res?.products || {}));
    });

  const syncOne = (id: string) =>
    run(`sync-${id}`, 'ส่งข้อมูลสินค้านี้ไปยัง Marketplace แล้ว', async () => {
      setResults([await marketplace('products.sync', { id, csrf })]);
    });

  const syncAll = () =>
    run('sync-all', 'ซิงก์สินค้าทั้งหมดแล้ว', async () => {
      const res = await marketplace<any>('products.sync_all', { csrf });
      setResults(Array.isArray(res?.results) ? res.results : [res]);
    });

  const syncSelected = () =>
    run('sync-selected', `ซิงก์สินค้าที่เลือก ${selected.length} รายการแล้ว`, async () => {
      if (!selected.length) throw new Error('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ');
      const out: any[] = [];
      for (const id of selected.slice(0, 100)) {
        try {
          out.push(await marketplace('products.sync', { id, csrf }));
        } catch (error) {
          out.push({ id, ok: false, error: marketplaceMessage(error) });
        }
      }
      setResults(out);
    });

  const pull = (provider: 'shopee' | 'lazada') =>
    run(`pull-${provider}`, `ดึงรายการจาก ${provider === 'shopee' ? 'Shopee' : 'Lazada'} แล้ว`, async () => {
      const res = await marketplace<any>(`${provider}.products`);
      const data = res?.data ?? res;
      const items = extractMarketplaceItems(data);
      setImportSource(provider);
      setRemoteItems(items);
      setPreviewItems([]);
      setResults([{ provider, found_items: items.length, data }]);
    });

  const previewImport = () =>
    run('import-preview', '', async () => {
      if (!remoteItems.length) throw new Error('กรุณาดึงรายการจาก Shopee หรือ Lazada ก่อน');
      const res = await legacyRequest<any>(
        'admin.marketplace.import.preview',
        { source: importSource, items: remoteItems.slice(0, 500), csrf },
        'POST',
      );
      setPreviewItems(Array.isArray(res?.items) ? res.items : []);
      setResults([
        { source: importSource, preview_ready: res?.ready || 0, preview_review: res?.review || 0 },
      ]);
    });

  const commitImport = () =>
    run('import-commit', 'นำเข้าสินค้าจาก Marketplace แล้ว', async () => {
      if (!remoteItems.length) throw new Error('ไม่มีรายการสำหรับนำเข้า');
      const res = await legacyRequest<any>(
        'admin.marketplace.import.commit',
        { source: importSource, items: remoteItems.slice(0, 500), publish: publishImport, csrf },
        'POST',
      );
      setResults([res]);
      setPreviewItems([]);
      await loadProducts();
    });

  const ProviderCard = ({ provider, status }: { provider: 'shopee' | 'lazada'; status: ProviderStatus }) => (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold capitalize">{provider}</h2>
          <p className="mt-1 text-sm text-slate-500">OAuth connection · catalogue read · price/stock sync</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${status.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
        >
          {status.connected ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}
        </span>
      </div>
      {(status.shop_id || status.seller_id) && (
        <p className="mt-3 text-xs text-slate-500">ID: {status.shop_id || status.seller_id}</p>
      )}
      {status.error && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">{status.error}</p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={() => connect(provider)}
          disabled={busy === `connect-${provider}`}
          className="rounded-xl bg-emerald-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {status.connected ? 'เชื่อมต่อใหม่' : `เชื่อมต่อ ${provider === 'shopee' ? 'Shopee' : 'Lazada'}`}
        </button>
        <button
          onClick={() => pull(provider)}
          disabled={!status.connected || busy === `pull-${provider}`}
          className="rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          ดึงรายการสินค้า
        </button>
      </div>
    </section>
  );

  return (
    <div className="grid gap-6">
      {notice && (
        <p
          className={`rounded-2xl border p-4 text-sm font-semibold ${notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}
        >
          {notice.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/settings" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">
          ตั้งค่า API key
        </Link>
        <button
          onClick={refreshStatus}
          disabled={busy === 'status'}
          className="rounded-xl border bg-white px-4 py-2 text-sm font-bold"
        >
          รีเฟรชสถานะ
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ProviderCard provider="shopee" status={shopee} />
        <ProviderCard provider="lazada" status={lazada} />
      </div>
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Product Sync</h2>
            <p className="mt-1 text-sm text-slate-500">
              ส่งชื่อ ราคา และสต็อกจากระบบกลางไปยังช่องทางที่ผูก item id ไว้แล้ว
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadProducts}
              disabled={busy === 'rows'}
              className="rounded-xl border px-3 py-2 text-sm font-bold"
            >
              {busy === 'rows' ? 'กำลังโหลด…' : 'โหลดสินค้า'}
            </button>
            <button
              onClick={syncSelected}
              disabled={busy === 'sync-selected' || !selected.length}
              className="rounded-xl border border-emerald-700 px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-40"
            >
              {busy === 'sync-selected' ? 'กำลังซิงก์…' : `ซิงก์ที่เลือก (${selected.length})`}
            </button>
            <button
              onClick={syncAll}
              disabled={busy === 'sync-all'}
              className="rounded-xl bg-emerald-950 px-3 py-2 text-sm font-bold text-white"
            >
              {busy === 'sync-all' ? 'กำลังซิงก์…' : 'ซิงก์ทั้งหมด'}
            </button>
          </div>
        </div>
        {rows.length ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-10 min-w-[260px] flex-1 rounded-xl border px-3 text-sm"
                placeholder="ค้นหาชื่อ / SKU / Marketplace item ID"
              />
              <button
                type="button"
                onClick={() => setSelected(filteredRows.slice(0, 100).map((row) => String(row.id)))}
                className="rounded-xl border px-3 py-2 text-xs font-bold"
              >
                เลือกผลลัพธ์
              </button>
              <button
                type="button"
                onClick={() => setSelected([])}
                className="rounded-xl border px-3 py-2 text-xs font-bold"
              >
                ล้างที่เลือก
              </button>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="w-10 p-2"></th>
                    <th className="p-2">สินค้า</th>
                    <th className="p-2">SKU</th>
                    <th className="p-2">Shopee ID</th>
                    <th className="p-2">Lazada ID</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.slice(0, 100).map((row) => {
                    const id = String(row.id);
                    const checked = selected.includes(id);
                    return (
                      <tr key={id} className={`border-b last:border-0 ${checked ? 'bg-emerald-50/60' : ''}`}>
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelected((current) =>
                                current.includes(id)
                                  ? current.filter((value) => value !== id)
                                  : [...current, id],
                              )
                            }
                            aria-label={`เลือก ${row.name || id}`}
                          />
                        </td>
                        <td className="p-2 font-semibold">{row.name || id}</td>
                        <td className="p-2">
                          <code className="text-xs">{row.sku || '—'}</code>
                        </td>
                        <td className="p-2">{row.shopee_item_id || '—'}</td>
                        <td className="p-2">{row.lazada_item_id || '—'}</td>
                        <td className="p-2 text-right">
                          <button
                            onClick={() => syncOne(id)}
                            disabled={busy === `sync-${id}`}
                            className="rounded-lg border px-3 py-1.5 text-xs font-bold"
                          >
                            ซิงก์
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-slate-500">
                แสดง {Math.min(filteredRows.length, 100)} จาก {filteredRows.length} รายการที่ตรงเงื่อนไข · Catalog
                ทั้งหมด {rows.length}
              </p>
            </div>
          </>
        ) : (
          <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">ยังไม่ได้โหลดรายการสินค้า</p>
        )}
      </section>
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Marketplace → Central Catalog Import</h2>
            <p className="mt-1 text-sm text-slate-500">
              ดึงข้อมูลจากร้าน → Preview การจับคู่ Brand/Category → ตรวจทาน → Commit เข้า Catalog กลาง โดยยังเก็บ source
              item id ไว้สำหรับ trace ย้อนกลับ
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">
            Source: {importSource === 'shopee' ? 'Shopee' : 'Lazada'}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => pull(importSource)}
            disabled={busy === `pull-${importSource}`}
            className="rounded-xl border px-3 py-2 text-sm font-bold"
          >
            ดึงข้อมูล {importSource === 'shopee' ? 'Shopee' : 'Lazada'} ใหม่
          </button>
          <button
            type="button"
            onClick={previewImport}
            disabled={!remoteItems.length || busy === 'import-preview'}
            className="rounded-xl border border-violet-300 px-3 py-2 text-sm font-bold text-violet-800 disabled:opacity-40"
          >
            {busy === 'import-preview' ? 'กำลัง Preview…' : `Preview Mapping (${remoteItems.length})`}
          </button>
          <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold">
            <input
              type="checkbox"
              checked={publishImport}
              onChange={(event) => setPublishImport(event.target.checked)}
            />{' '}
            เปิดขายทันทีหลัง Import
          </label>
          <button
            type="button"
            onClick={commitImport}
            disabled={!previewItems.length || busy === 'import-commit'}
            className="rounded-xl bg-emerald-950 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy === 'import-commit' ? 'กำลัง Import…' : 'Commit เข้า Catalog'}
          </button>
        </div>
        {!remoteItems.length ? (
          <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            ยังไม่มีข้อมูลดิบ กรุณากด “ดึงรายการสินค้า” ในการ์ด Shopee/Lazada ด้านบนก่อน
          </p>
        ) : (
          <p className="mt-4 text-xs text-slate-500">
            พบข้อมูลดิบ {remoteItems.length.toLocaleString('th-TH')} รายการ · Preview/Commit จำกัดครั้งละ 500
            รายการเพื่อควบคุมเวลาและ memory
          </p>
        )}
        {!!previewItems.length && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[940px] text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
                  <th className="p-2">สถานะ</th>
                  <th className="p-2">สินค้า</th>
                  <th className="p-2">SKU</th>
                  <th className="p-2">Brand</th>
                  <th className="p-2">Category</th>
                  <th className="p-2 text-right">ราคา</th>
                  <th className="p-2 text-right">Stock</th>
                  <th className="p-2">ต้องตรวจ</th>
                </tr>
              </thead>
              <tbody>
                {previewItems.slice(0, 200).map((item, index) => (
                  <tr key={`${item.source_id || item.sku || index}`} className="border-b last:border-0">
                    <td className="p-2">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-black ${item.mapping_status === 'ready' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}
                      >
                        {item.mapping_status || 'review'}
                      </span>
                    </td>
                    <td className="p-2 font-semibold">{item.name || '—'}</td>
                    <td className="p-2">
                      <code className="text-xs">{item.sku || '—'}</code>
                    </td>
                    <td className="p-2">{item.brand || '—'}</td>
                    <td className="p-2">{item.category || '—'}</td>
                    <td className="p-2 text-right">฿{Number(item.price || 0).toLocaleString('th-TH')}</td>
                    <td className="p-2 text-right">{Number(item.stock || 0).toLocaleString('th-TH')}</td>
                    <td className="p-2 text-xs text-amber-800">
                      {Array.isArray(item.mapping_notes) && item.mapping_notes.length
                        ? item.mapping_notes.join(', ')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-slate-500">
              แสดง Preview สูงสุด 200 รายการบนหน้าจอ; Commit ใช้ชุดข้อมูลดิบที่ Server normalize ซ้ำอีกครั้ง
            </p>
          </div>
        )}
      </section>

      {!!results.length && (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="font-bold">ผลลัพธ์ล่าสุด</h2>
          <details className="mt-3" open>
            <summary className="cursor-pointer text-sm font-semibold">ดูคำตอบจาก Marketplace</summary>
            <pre className="mt-3 max-h-[520px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(results, null, 2)}
            </pre>
          </details>
        </section>
      )}
    </div>
  );
}
