'use client';

import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { init, use, type ECharts } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import {
  CalendarDays,
  Download,
  Eye,
  Package,
  RefreshCcw,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  WalletCards,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';

use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

type Row = Record<string, any>;
type Range = { from: string; to: string };

type Props = {
  initialRange: Range;
  initialSales: Row;
  initialAnalytics: Row;
  initialError?: string;
};

const presets = [
  { label: 'วันนี้', days: 1 },
  { label: '7 วัน', days: 7 },
  { label: '30 วัน', days: 30 },
  { label: '3 เดือน', days: 90 },
];

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const num = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const fmt = (value: unknown) => num(value).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const money = (value: unknown) => `฿${fmt(value)}`;

function rangeForDays(days: number): Range {
  const today = new Date();
  return { from: isoDay(new Date(today.getTime() - (Math.max(1, days) - 1) * 86_400_000)), to: isoDay(today) };
}

function fillSeries(source: Row[], range: Range, keys: string[]) {
  if (!range.from || !range.to) return source;
  const byDate = new Map(source.map((row) => [String(row.date || row.day || '').slice(0, 10), row]));
  const out: Row[] = [];
  const start = Date.parse(`${range.from}T00:00:00Z`);
  const end = Date.parse(`${range.to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return source;
  for (let time = start; time <= end; time += 86_400_000) {
    const date = new Date(time).toISOString().slice(0, 10);
    const row: Row = { date };
    const found = byDate.get(date);
    for (const key of keys) row[key] = num(found?.[key]);
    out.push(row);
  }
  return out;
}

function change(current: unknown, previous: unknown) {
  const a = num(current);
  const b = num(previous);
  return b > 0 ? ((a - b) / b) * 100 : null;
}

function errorCode(error: unknown) {
  return error instanceof LegacyApiError ? error.code : error instanceof Error ? error.message : 'unknown_error';
}

export function ReportDashboard({ initialRange, initialSales, initialAnalytics, initialError = '' }: Props) {
  const [range, setRange] = useState<Range>(initialRange);
  const [custom, setCustom] = useState(false);
  const [sales, setSales] = useState<Row>(initialSales);
  const [analytics, setAnalytics] = useState<Row>(initialAnalytics);
  const [insightData, setInsightData] = useState<Row>({ insight_status: 'deferred', insights: [] });
  const [busy, setBusy] = useState(false);
  const [insightBusy, setInsightBusy] = useState(false);
  const [error, setError] = useState(initialError);

  const summary = sales.summary || {};
  const traffic = analytics.summary || analytics.metrics || {};
  const previousSales = sales.previous?.summary || {};
  const previousTraffic = analytics.previous?.summary || {};
  const members = analytics.members || {};
  const funnel = analytics.funnel || {};
  const salesDaily = useMemo(() => fillSeries(Array.isArray(sales.daily) ? sales.daily : [], range, ['orders', 'revenue', 'units', 'profit']), [sales, range]);
  const trafficDaily = useMemo(() => fillSeries(Array.isArray(analytics.daily) ? analytics.daily : [], range, ['visitors', 'new_visitors', 'returning_visitors', 'pageviews']), [analytics, range]);
  const topViewed = Array.isArray(analytics.top_products) ? analytics.top_products : [];
  const topSold = Array.isArray(sales.top_products) ? sales.top_products : [];
  const topPages = Array.isArray(analytics.top_pages) ? analytics.top_pages : [];
  const visitors = traffic.visitors ?? traffic.unique_visitors ?? traffic.users ?? 0;
  const pageviews = traffic.pageviews ?? traffic.page_views ?? traffic.views ?? 0;
  const paidOrders = num(summary.paid_orders ?? summary.orders);
  const aov = paidOrders > 0 ? num(summary.revenue) / paidOrders : 0;
  const priorPaid = num(previousSales.paid_orders ?? previousSales.orders);
  const priorAov = priorPaid > 0 ? num(previousSales.revenue) / priorPaid : 0;

  const cards = [
    { label: 'ผู้เข้าชม', value: fmt(visitors), delta: change(visitors, previousTraffic.visitors), icon: Users },
    { label: 'Page Views', value: fmt(pageviews), delta: change(pageviews, previousTraffic.pageviews), icon: Eye },
    { label: 'สมาชิกทั้งหมด', value: fmt(members.total), delta: change(members.joined, members.previous_joined), icon: UserPlus, note: `สมัครใหม่ ${fmt(members.joined)} คน` },
    { label: 'คำสั่งซื้อ', value: fmt(summary.orders), delta: change(summary.orders, previousSales.orders), icon: ShoppingCart },
    { label: 'ยอดขาย', value: money(summary.revenue), delta: change(summary.revenue, previousSales.revenue), icon: WalletCards },
    { label: 'AOV', value: money(aov), delta: change(aov, priorAov), icon: TrendingUp },
  ];

  const stages = [
    ['เข้าเว็บไซต์', visitors],
    ['ดูสินค้า', funnel.product_views ?? funnel.products ?? 0],
    ['ใส่ตะกร้า', funnel.add_to_cart ?? funnel.cart ?? 0],
    ['Checkout', funnel.checkout ?? funnel.begin_checkout ?? 0],
    ['ซื้อสำเร็จ', funnel.purchase ?? funnel.purchases ?? summary.paid_orders ?? 0],
  ] as const;

  async function load(nextRange = range) {
    if (!nextRange.from || !nextRange.to || nextRange.from > nextRange.to) {
      setError('ช่วงวันที่ไม่ถูกต้อง');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const [nextSales, nextAnalytics] = await Promise.all([
        legacyRequest<Row>('admin.reports.sales', { ...nextRange, include_previous: '1' }),
        legacyRequest<Row>('admin.analytics.report', nextRange),
      ]);
      setSales(nextSales);
      setAnalytics(nextAnalytics);
      setRange(nextRange);
      void loadInsights(nextRange);
    } catch (err) {
      setError(`โหลดรายงานไม่สำเร็จ: ${errorCode(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function loadInsights(nextRange = range) {
    setInsightBusy(true);
    try {
      setInsightData(await legacyRequest<Row>('admin.analytics.report', { ...nextRange, with_insights: '1' }));
    } catch (err) {
      setInsightData({ insight_status: errorCode(err), insights: [] });
    } finally {
      setInsightBusy(false);
    }
  }

  function applyPreset(days: number) {
    const next = rangeForDays(days);
    setCustom(false);
    setRange(next);
    void load(next);
  }

  function exportCsv() {
    const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const output: string[] = [];
    const section = (title: string, headers: string[], body: unknown[][]) => {
      output.push(cell(title), headers.map(cell).join(','), ...body.map((row) => row.map(cell).join(',')), '');
    };
    section('ช่วงข้อมูล', ['ตั้งแต่', 'ถึง'], [[range.from, range.to]]);
    section('ยอดขาย', ['รายการ', 'ค่า'], Object.entries(summary).filter(([, value]) => typeof value === 'number').map(([key, value]) => [key, value]));
    section('ยอดขายรายวัน', ['วันที่', 'ออเดอร์', 'ยอดขาย', 'จำนวนชิ้น', 'กำไร'], salesDaily.map((row) => [row.date, row.orders, row.revenue, row.units, row.profit]));
    section('ผู้เข้าชมรายวัน', ['วันที่', 'ผู้เข้าชม', 'ใหม่', 'กลับมา', 'Page Views'], trafficDaily.map((row) => [row.date, row.visitors, row.new_visitors, row.returning_visitors, row.pageviews]));
    section('สินค้าขายดี', ['อันดับ', 'สินค้า', 'ชิ้น', 'ยอดขาย', 'กำไร'], topSold.map((row: Row, index: number) => [index + 1, row.name || row.product_id, row.units, row.revenue, row.profit]));
    section('หน้าที่เข้าชมบ่อย', ['หน้า', 'ครั้ง'], topPages.map((row: Row) => [row.path || row.url || row.page || '/', row.views ?? row.count ?? row.pageviews]));
    const blob = new Blob([`\ufeff${output.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `report-${range.from}-${range.to}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const insights = Array.isArray(insightData.insights) ? insightData.insights : [];
  const salesSource = String(sales.source || 'commerce');
  return <div className="space-y-5">
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">● LIVE ANALYTICS</span><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-black ${salesSource === 'relational' ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>{salesSource === 'relational' ? 'PostgreSQL relational' : 'Commerce compatibility'}</span>
        <span className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold text-slate-600"><CalendarDays size={15}/>{range.from} → {range.to}</span>
        {presets.map((preset) => <button key={preset.days} type="button" disabled={busy} onClick={() => applyPreset(preset.days)} className="rounded-xl border px-3 py-2 text-xs font-bold hover:bg-slate-50">{preset.label}</button>)}
        <button type="button" onClick={() => setCustom((value) => !value)} className={`rounded-xl border px-3 py-2 text-xs font-bold ${custom ? 'bg-emerald-950 text-white' : ''}`}>กำหนดเอง</button>
        <button type="button" disabled={busy} onClick={() => void load()} className="ml-auto inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"><RefreshCcw size={14} className={busy ? 'animate-spin' : ''}/>รีเฟรช</button>
        <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl bg-emerald-950 px-3 py-2 text-xs font-bold text-white"><Download size={14}/>CSV</button>
      </div>
      {custom && <form onSubmit={(event) => { event.preventDefault(); void load(range); }} className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-[1fr_1fr_auto]"><label className="text-xs font-bold text-slate-600">ตั้งแต่<input type="date" value={range.from} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} className="mt-1 block h-11 w-full rounded-xl border px-3 text-sm"/></label><label className="text-xs font-bold text-slate-600">ถึง<input type="date" min={range.from} value={range.to} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} className="mt-1 block h-11 w-full rounded-xl border px-3 text-sm"/></label><button disabled={busy} className="self-end rounded-xl bg-emerald-950 px-4 py-3 text-sm font-bold text-white">ใช้ช่วงนี้</button></form>}
    </section>

    {error && <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700" role="alert">{error}</p>}

    <div className="grid auto-cols-[minmax(210px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-1 xl:grid-flow-row xl:grid-cols-6">{cards.map((card) => <article key={card.label} className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><span className="grid size-9 place-items-center rounded-xl bg-slate-100 text-emerald-900"><card.icon size={18}/></span>{card.delta != null && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black ${card.delta >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{card.delta >= 0 ? <TrendingUp size={11}/> : <TrendingDown size={11}/>} {Math.abs(card.delta).toFixed(1)}%</span>}</div><p className="mt-4 text-xs font-bold text-slate-500">{card.label}</p><strong className="mt-1 block text-2xl font-black text-slate-950">{card.value}</strong><p className="mt-1 min-h-4 text-[10px] text-slate-400">{card.note || (card.delta == null ? 'ยังไม่มีช่วงก่อนหน้าให้เทียบ' : 'เทียบช่วงก่อนหน้า')}</p></article>)}</div>

    <div className="grid gap-5 xl:grid-cols-2">
      <TrendChart title="ยอดขายและคำสั่งซื้อ" rows={salesDaily} series={[['revenue', 'ยอดขาย'], ['orders', 'ออเดอร์']]} />
      <TrendChart title="Traffic" rows={trafficDaily} series={[['visitors', 'ผู้เข้าชม'], ['pageviews', 'Page Views']]} />
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="mb-4"><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Customer journey</p><h2 className="mt-1 text-lg font-black">Conversion Funnel</h2></div><div className="grid gap-2 sm:grid-cols-5">{stages.map(([label, value], index) => <div key={label} className="rounded-2xl bg-slate-50 p-3 text-center"><span className="text-[10px] font-bold text-slate-500">{index + 1}. {label}</span><strong className="mt-2 block text-xl">{fmt(value)}</strong><small className="mt-1 block text-emerald-700">{num(visitors) > 0 ? `${((num(value) / num(visitors)) * 100).toFixed(1)}%` : '—'}</small></div>)}</div></section>
      <section className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Profitability</p><h2 className="mt-1 text-lg font-black">ยอดขายสุทธิและกำไร</h2><dl className="mt-4 space-y-2 text-sm">{[
        ['ยอดขายรวม', money(summary.revenue)],
        ['คืนเงิน', money(summary.refunds)],
        ['ยอดขายสุทธิ', money(summary.net_sales)],
        ['ต้นทุนสินค้า', money(summary.cost)],
        ['ค่าขนส่ง', money(summary.shipping)],
        ['กำไรขั้นต้น', money(summary.gross_profit)],
        ['Margin', `${num(summary.margin_percent).toFixed(1)}%`],
        ['VAT รวม', money(summary.vat_included)],
      ].map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b py-2 last:border-0"><dt className="text-slate-500">{label}</dt><dd className="font-black tabular-nums">{value}</dd></div>)}</dl></section>
    </div>

    <div className="grid gap-5 xl:grid-cols-3">
      <Ranking title="สินค้าที่ขายดีที่สุด" icon={ShoppingCart} rows={topSold} value={(row) => `${fmt(row.units)} ชิ้น · ${money(row.revenue)}`} />
      <Ranking title="สินค้าที่ถูกดูมากที่สุด" icon={Package} rows={topViewed} value={(row) => `${fmt(row.views ?? row.count ?? row.value)} ครั้ง`} />
      <Ranking title="หน้าที่มีคนเข้าเยอะ" icon={Eye} rows={topPages} name={(row) => String(row.path || row.url || row.page || '/')} value={(row) => `${fmt(row.views ?? row.count ?? row.pageviews)} ครั้ง`} />
    </div>

    <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-violet-700">AI ANALYST</p><h2 className="mt-1 flex items-center gap-2 text-lg font-black"><Sparkles size={18}/>Insight จากระบบ AI</h2></div><button type="button" disabled={insightBusy} onClick={() => void loadInsights()} className="rounded-xl border px-3 py-2 text-xs font-bold">{insightBusy ? 'กำลังวิเคราะห์…' : 'วิเคราะห์ใหม่'}</button></div>{insights.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{insights.slice(0, 6).map((item: Row, index: number) => <article key={index} className="rounded-2xl bg-violet-50/60 p-4"><strong className="text-sm text-violet-950">{item.title || item.badge || `Insight ${index + 1}`}</strong><p className="mt-2 text-sm leading-6 text-slate-600">{item.text || item.description || String(item)}</p></article>)}</div> : <div className="mt-4 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">{insightBusy ? 'กำลังให้ AI วิเคราะห์ข้อมูล โดยกราฟและตัวเลขด้านบนยังใช้งานได้ตามปกติ…' : insightMessage(insightData.insight_status)}</div>}</section>
  </div>;
}

function TrendChart({ title, rows, series }: { title: string; rows: Row[]; series: Array<[string, string]> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart: ECharts = init(ref.current);
    chart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: { left: 50, right: 20, top: 45, bottom: 55 },
      xAxis: { type: 'category', data: rows.map((row) => String(row.date || row.day || '')), axisLabel: { hideOverlap: true } },
      yAxis: { type: 'value' },
      series: series.map(([key, label]) => ({ name: label, type: key === 'orders' ? 'bar' : 'line', smooth: true, showSymbol: rows.length < 40, data: rows.map((row) => num(row[key])) })),
    });
    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); chart.dispose(); };
  }, [rows, series]);
  return <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-black">{title}</h2><div ref={ref} className="mt-3 h-80 w-full"/></section>;
}

function Ranking({ title, icon: Icon, rows, name = (row) => String(row.name || row.product_name || row.product_id || '—'), value }: { title: string; icon: typeof Eye; rows: Row[]; name?: (row: Row) => string; value: (row: Row) => string }) {
  return <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-black"><Icon size={17}/>{title}</h2><ol className="mt-4 space-y-2">{rows.slice(0, 7).map((row, index) => <li key={String(row.product_id || row.path || index)} className="grid grid-cols-[28px_1fr_auto] items-center gap-2 rounded-xl bg-slate-50 p-3"><span className="grid size-7 place-items-center rounded-full bg-white text-xs font-black">{index + 1}</span><strong className="line-clamp-2 text-xs">{name(row)}</strong><span className="text-right text-[10px] font-bold text-slate-500">{value(row)}</span></li>)}{!rows.length && <li className="py-10 text-center text-sm text-slate-400">ยังไม่มีข้อมูล</li>}</ol></section>;
}

function insightMessage(status: unknown) {
  const messages: Record<string, string> = {
    deferred: 'ระบบแยก AI ออกจากรายงานหลักเพื่อไม่ให้การโหลดตัวเลขช้าลง กด “วิเคราะห์ใหม่” เพื่อขอ Insight',
    not_configured: 'ยังไม่ได้ตั้งค่า OpenAI/Gemini/n8n สำหรับ AI Insight',
    no_data: 'ยังมีข้อมูลไม่พอสำหรับวิเคราะห์',
    upstream_error: 'บริการ AI ตอบกลับไม่สำเร็จ กรุณาตรวจ API key / quota',
    empty_reply: 'บริการ AI ตอบกลับว่างเปล่า',
    unavailable: 'เชื่อมต่อบริการ AI ไม่ได้ในขณะนี้',
    unparsable: 'AI ตอบกลับในรูปแบบที่ระบบอ่านไม่ได้',
  };
  return messages[String(status || '')] || `ยังไม่มีบทวิเคราะห์ (${String(status || 'unknown')})`;
}
