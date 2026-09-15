'use client';

import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { type ECharts, init, use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  Download,
  Package,
  RefreshCcw,
  Search,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  WalletCards,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';

use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

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
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const fmt = (value: unknown) => num(value).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const money = (value: unknown) => `฿${fmt(value)}`;

function rangeForDays(days: number): Range {
  const today = new Date();
  return {
    from: isoDay(new Date(today.getTime() - (Math.max(1, days) - 1) * 86_400_000)),
    to: isoDay(today),
  };
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
    const found = byDate.get(date);
    const row: Row = { date };
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
  return error instanceof LegacyApiError
    ? error.code
    : error instanceof Error
      ? error.message
      : 'unknown_error';
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
  const [search, setSearch] = useState('');

  const summary = sales.summary || {};
  const traffic = analytics.summary || analytics.metrics || {};
  const previousSales = sales.previous?.summary || {};
  const previousTraffic = analytics.previous?.summary || {};
  const members = analytics.members || {};
  const _funnel = analytics.funnel || {};
  const salesDaily = useMemo(
    () =>
      fillSeries(Array.isArray(sales.daily) ? sales.daily : [], range, [
        'orders',
        'revenue',
        'units',
        'profit',
      ]),
    [sales, range],
  );
  const trafficDaily = useMemo(
    () =>
      fillSeries(Array.isArray(analytics.daily) ? analytics.daily : [], range, [
        'visitors',
        'new_visitors',
        'returning_visitors',
        'pageviews',
      ]),
    [analytics, range],
  );
  const combinedDaily = useMemo(
    () =>
      salesDaily.map((row, index) => ({
        ...row,
        visitors: num(trafficDaily[index]?.visitors),
        pageviews: num(trafficDaily[index]?.pageviews),
      })),
    [salesDaily, trafficDaily],
  );
  const topViewed = Array.isArray(analytics.top_products) ? analytics.top_products : [];
  const topSold = Array.isArray(sales.top_products) ? sales.top_products : [];
  const visitors = traffic.visitors ?? traffic.unique_visitors ?? traffic.users ?? 0;
  const estimatedProfit = num(summary.gross_profit ?? summary.profit);

  const cards = [
    {
      label: 'ผู้เข้าชมเว็บไซต์',
      value: fmt(visitors),
      delta: change(visitors, previousTraffic.visitors),
      icon: Users,
      color: '#0aa878',
      series: trafficDaily.map((row) => row.visitors),
    },
    {
      label: 'คำสั่งซื้อใหม่',
      value: fmt(summary.orders),
      delta: change(summary.orders, previousSales.orders),
      icon: ShoppingCart,
      color: '#1677ee',
      series: salesDaily.map((row) => row.orders),
    },
    {
      label: 'ลูกค้าใหม่',
      value: fmt(members.joined ?? members.new ?? 0),
      delta: change(members.joined, members.previous_joined),
      icon: UserPlus,
      color: '#8226ed',
      series: trafficDaily.map((row) => row.new_visitors),
    },
    {
      label: 'สินค้าที่ขายได้',
      value: fmt(summary.units),
      delta: change(summary.units, previousSales.units),
      icon: Package,
      color: '#ff8a1f',
      series: salesDaily.map((row) => row.units),
    },
    {
      label: 'ยอดขายรวม',
      value: money(summary.revenue),
      delta: change(summary.revenue, previousSales.revenue),
      icon: WalletCards,
      color: '#0bbd8d',
      series: salesDaily.map((row) => row.revenue),
    },
    {
      label: 'กำไรโดยประมาณ',
      value: money(estimatedProfit),
      delta: change(estimatedProfit, previousSales.gross_profit),
      icon: TrendingUp,
      color: '#f2295b',
      series: salesDaily.map((row) => row.profit),
    },
  ];

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
      setInsightData(
        await legacyRequest<Row>('admin.analytics.report', { ...nextRange, with_insights: '1' }),
      );
    } catch (err) {
      setInsightData({ insight_status: errorCode(err), insights: [] });
    } finally {
      setInsightBusy(false);
    }
  }

  function exportCsv() {
    const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const output: string[] = [];
    const section = (title: string, headers: string[], body: unknown[][]) => {
      output.push(
        cell(title),
        headers.map(cell).join(','),
        ...body.map((row) => row.map(cell).join(',')),
        '',
      );
    };
    section('ช่วงข้อมูล', ['ตั้งแต่', 'ถึง'], [[range.from, range.to]]);
    section(
      'ยอดขาย',
      ['รายการ', 'ค่า'],
      Object.entries(summary)
        .filter(([, value]) => typeof value === 'number')
        .map(([key, value]) => [key, value]),
    );
    section(
      'ยอดขายรายวัน',
      ['วันที่', 'ออเดอร์', 'ยอดขาย', 'จำนวนชิ้น', 'กำไร'],
      salesDaily.map((row) => [row.date, row.orders, row.revenue, row.units, row.profit]),
    );
    section(
      'ผู้เข้าชมรายวัน',
      ['วันที่', 'ผู้เข้าชม', 'ใหม่', 'กลับมา', 'Page Views'],
      trafficDaily.map((row) => [
        row.date,
        row.visitors,
        row.new_visitors,
        row.returning_visitors,
        row.pageviews,
      ]),
    );
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
  return (
    <div className="report-dashboard">
      <ReportTopbar range={range} onRefresh={() => void load()} search={search} onSearch={setSearch} />
      <header className="report-heading">
        <div>
          <p className="report-kicker">ADMIN ANALYTICS</p>
          <h1>สวัสดีครับ 👋</h1>
          <p>สรุปภาพรวมร้านค้าของคุณวันนี้</p>
        </div>
        <div className="report-heading-note">
          อัปเดตล่าสุด {new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </header>

      <section className="report-toolbar" aria-label="ตัวกรองรายงาน">
        <div className="report-live-pill">
          <span /> LIVE ANALYTICS
        </div>
        <div className="report-compat-pill">Commerce compatibility</div>
        <button type="button" className="report-date-pill" onClick={() => setCustom((value) => !value)}>
          <CalendarDays size={15} /> {range.from} – {range.to} <ChevronDown size={14} />
        </button>
        <div className="report-presets">
          {presets.map((preset) => (
            <button
              key={preset.days}
              type="button"
              disabled={busy}
              className={range.from === rangeForDays(preset.days).from ? 'is-active' : ''}
              onClick={() => void load(rangeForDays(preset.days))}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="report-action report-action-refresh"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCcw size={14} className={busy ? 'animate-spin' : ''} /> รีเฟรช
        </button>
        <button type="button" className="report-action report-action-export" onClick={exportCsv}>
          <Download size={14} /> CSV
        </button>
      </section>
      {custom && (
        <div className="report-custom-range">
          <label>
            ตั้งแต่
            <input
              type="date"
              value={range.from}
              onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))}
            />
          </label>
          <label>
            ถึง
            <input
              type="date"
              min={range.from}
              value={range.to}
              onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))}
            />
          </label>
          <button type="button" onClick={() => void load()}>
            ใช้ช่วงนี้
          </button>
        </div>
      )}
      {error && (
        <p className="report-error" role="alert">
          {error}
        </p>
      )}

      <section className="report-metric-grid">
        {cards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </section>

      <section className="report-primary-grid">
        <CombinedTrendChart rows={combinedDaily} />
        <InsightPanel
          insights={insights}
          busy={insightBusy}
          status={insightData.insight_status}
          onRefresh={() => void loadInsights()}
        />
      </section>

      <section className="report-data-grid">
        <ChannelCard analytics={analytics} total={num(visitors)} />
        <ProductTable
          title="สินค้าที่ถูกดูมากที่สุด"
          rows={topViewed.filter((row: Row) =>
            String(row.name || row.product_id || '')
              .toLowerCase()
              .includes(search.toLowerCase()),
          )}
          mode="views"
        />
        <ProductTable
          title="สินค้าขายดี (ตามยอดขาย)"
          rows={topSold.filter((row: Row) =>
            String(row.name || row.product_id || '')
              .toLowerCase()
              .includes(search.toLowerCase()),
          )}
          mode="sales"
        />
      </section>

      <section className="report-lower-grid">
        <SimpleTable
          title="คำสั่งซื้อล่าสุด"
          rows={Array.isArray(sales.recent_orders) ? sales.recent_orders : []}
          kind="orders"
        />
        <SimpleTable
          title="ลูกค้าใหม่ล่าสุด"
          rows={Array.isArray(analytics.new_customers) ? analytics.new_customers : []}
          kind="customers"
        />
        <AiBanner onAnalyze={() => void loadInsights()} />
      </section>

      <section className="report-footnote">
        <div>
          <Sparkles size={18} />
          <span>ตัวเลขทั้งหมดดึงจากข้อมูลหลังบ้านตามช่วงเวลาที่เลือก</span>
        </div>
        <span>ข้อมูลอาจแตกต่างเมื่อ PostgreSQL / Redis ยังไม่พร้อมใช้งาน</span>
      </section>
    </div>
  );
}

function ReportTopbar({
  range,
  onRefresh,
  search,
  onSearch,
}: {
  range: Range;
  onRefresh: () => void;
  search: string;
  onSearch: (value: string) => void;
}) {
  return (
    <div className="report-topbar">
      <div className="report-brand-mark">
        <span aria-hidden="true">TS</span>
        <span>THAISERKIT SUPPLY</span>
      </div>
      <label className="report-search">
        <Search size={17} />
        <input
          aria-label="ค้นหาสินค้าในรายงาน"
          placeholder="ค้นหาสินค้าในรายงาน..."
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
      </label>
      <div className="report-topbar-actions">
        <button type="button" title="รีเฟรชข้อมูล" onClick={onRefresh}>
          <RefreshCcw size={16} />
        </button>
        <span className="report-avatar">TS</span>
        <div className="report-account">
          <strong>Thaiserkit Supply</strong>
          <small>Administrator</small>
        </div>
        <ChevronDown size={15} />
      </div>
      <span className="sr-only">
        ช่วงวันที่ {range.from} ถึง {range.to}
      </span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  delta,
  icon: Icon,
  color,
  series,
}: {
  label: string;
  value: string;
  delta: number | null;
  icon: typeof Users;
  color: string;
  series: unknown[];
}) {
  return (
    <article className="report-metric-card">
      <div className="report-metric-icon" style={{ color, backgroundColor: `${color}16` }}>
        <Icon size={19} />
      </div>
      <p>{label}</p>
      <strong>{value}</strong>
      <span className={delta != null && delta < 0 ? 'report-delta is-down' : 'report-delta'}>
        {delta != null ? (
          <>
            {delta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {Math.abs(delta).toFixed(1)}%
          </>
        ) : (
          'ยังไม่มีช่วงก่อนหน้า'
        )}
      </span>
      <Sparkline values={series} color={color} />
    </article>
  );
}

function InsightPanel({
  insights,
  busy,
  status,
  onRefresh,
}: {
  insights: Row[];
  busy: boolean;
  status: unknown;
  onRefresh: () => void;
}) {
  return (
    <aside className="report-insight-panel">
      <div className="report-panel-heading">
        <div>
          <span className="report-ai-badge">AI</span>
          <div>
            <p>AI Analytics</p>
            <small>วิเคราะห์ข้อมูลด้วย AI เพื่อช่วยให้ธุรกิจของคุณเติบโต</small>
          </div>
        </div>
        <button type="button" onClick={onRefresh} disabled={busy}>
          ดูรายงาน AI เพิ่มเติม <ArrowUpRight size={14} />
        </button>
      </div>
      {insights.length ? (
        <div className="report-insight-list">
          {insights.slice(0, 4).map((item, index) => (
            <article
              key={String(item.id || item.title || index)}
              className={index === 0 ? 'is-highlight' : ''}
            >
              <span>{index === 0 ? '↗' : index === 1 ? '🛒' : index === 2 ? '👥' : '⌁'}</span>
              <div>
                <strong>{item.title || item.badge || 'AI Insight'}</strong>
                <p>{item.text || item.description || 'ดูรายละเอียดเพิ่มเติมจากข้อมูลของคุณ'}</p>
              </div>
              <b>›</b>
            </article>
          ))}
        </div>
      ) : (
        <div className="report-insight-empty">
          <Sparkles size={22} />
          {busy ? 'กำลังวิเคราะห์ข้อมูล...' : insightMessage(status)}
        </div>
      )}
      <button type="button" className="report-insight-cta" disabled={busy} onClick={onRefresh}>
        วิเคราะห์ข้อมูลใหม่ <ArrowUpRight size={15} />
      </button>
    </aside>
  );
}

function CombinedTrendChart({ rows }: { rows: Row[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart: ECharts = init(ref.current);
    chart.setOption({
      color: ['#0bb98a', '#1677ee'],
      tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
      legend: {
        top: 0,
        right: 0,
        icon: 'circle',
        itemWidth: 9,
        itemHeight: 9,
        textStyle: { color: '#61718a', fontSize: 12 },
      },
      grid: { left: 48, right: 46, top: 48, bottom: 36 },
      xAxis: {
        type: 'category',
        data: rows.map((row) => String(row.date || row.day || '').slice(5)),
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#dce5ef' } },
        axisLabel: { color: '#71819a', fontSize: 11, hideOverlap: true },
      },
      yAxis: [
        {
          type: 'value',
          axisLabel: { color: '#71819a', fontSize: 11 },
          splitLine: { lineStyle: { color: '#e8eef5' } },
        },
        { type: 'value', axisLabel: { color: '#71819a', fontSize: 11 }, splitLine: { show: false } },
      ],
      series: [
        {
          name: 'ยอดขาย (บาท)',
          type: 'line',
          yAxisIndex: 0,
          smooth: 0.35,
          showSymbol: rows.length < 40,
          symbolSize: 6,
          areaStyle: { opacity: 0.13 },
          data: rows.map((row) => num(row.revenue)),
        },
        {
          name: 'ผู้เข้าชม (คน)',
          type: 'line',
          yAxisIndex: 1,
          smooth: 0.35,
          showSymbol: rows.length < 40,
          symbolSize: 6,
          data: rows.map((row) => num(row.visitors)),
        },
      ],
    });
    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.dispose();
    };
  }, [rows]);
  return (
    <section className="report-panel report-trend-panel">
      <div className="report-panel-title">
        <div>
          <span className="report-section-icon is-green">▥</span>
          <div>
            <h2>ยอดขาย & ผู้เข้าชม</h2>
            <p>เปรียบเทียบยอดขายและจำนวนผู้เข้าชมในช่วงเวลาที่เลือก</p>
          </div>
        </div>
      </div>
      <div ref={ref} className="report-chart" />
    </section>
  );
}

function ChannelCard({ analytics, total }: { analytics: Row; total: number }) {
  const channels = normalizeChannels(analytics.channels || analytics.traffic_channels);
  const gradient = channels.reduce(
    (value, channel, index) =>
      `${value}${index ? ', ' : ''}${channel.color} ${channel.start}% ${channel.end}%`,
    '',
  );
  return (
    <section className="report-panel report-channel-card">
      <div className="report-panel-title">
        <div>
          <span className="report-section-icon is-teal">◫</span>
          <div>
            <h2>ช่องทางการเข้าชม</h2>
            <p>แหล่งที่มาของผู้เข้าชมเว็บไซต์</p>
          </div>
        </div>
      </div>
      <div className="report-donut-layout">
        <div
          className="report-donut"
          style={{ background: `conic-gradient(${gradient || '#e7edf5 0 100%'})` }}
        >
          <div>
            <strong>{fmt(total)}</strong>
            <span>ผู้เข้าชมรวม</span>
          </div>
        </div>
        <ul>
          {!channels.length && <li>ยังไม่มีข้อมูลแหล่งที่มา</li>}
          {channels.map((channel) => (
            <li key={channel.label}>
              <span style={{ background: channel.color }} />
              {channel.label}
              <b>{channel.percent.toFixed(1)}%</b>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ProductTable({ title, rows, mode }: { title: string; rows: Row[]; mode: 'views' | 'sales' }) {
  return (
    <section className="report-panel report-product-table">
      <div className="report-panel-title">
        <div>
          <span className={`report-section-icon ${mode === 'sales' ? 'is-violet' : 'is-blue'}`}>
            <Package size={15} />
          </span>
          <div>
            <h2>{title}</h2>
            <p>{mode === 'views' ? 'สินค้าที่ได้รับความสนใจสูงสุด' : 'เรียงตามยอดขายในช่วงเวลาที่เลือก'}</p>
          </div>
        </div>
        <Link href="/admin/products" className="report-see-all">
          ดูทั้งหมด <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="report-table-head">
        <span>#</span>
        <span>สินค้า</span>
        <span>{mode === 'views' ? 'จำนวนผู้เข้าชม' : 'ยอดขาย (บาท)'}</span>
        <span>แนวโน้ม</span>
      </div>
      <ol>
        {rows.slice(0, 5).map((row, index) => (
          <li key={String(row.product_id || row.id || index)}>
            <span>{index + 1}</span>
            <ProductThumb src={row.image_url || row.image || row.img} />
            <strong>{row.name || row.product_name || row.product_id || 'สินค้า'}</strong>
            <b>{mode === 'views' ? fmt(row.views ?? row.count ?? row.value) : money(row.revenue)}</b>
            <em>—</em>
          </li>
        ))}
        {!rows.length && <li className="report-table-empty">ยังไม่มีข้อมูลในช่วงเวลานี้</li>}
      </ol>
    </section>
  );
}

function SimpleTable({ title, rows, kind }: { title: string; rows: Row[]; kind: 'orders' | 'customers' }) {
  return (
    <section className="report-panel report-simple-table">
      <div className="report-panel-title">
        <div>
          <span className="report-section-icon is-slate">
            {kind === 'orders' ? <ShoppingCart size={15} /> : <Users size={15} />}
          </span>
          <div>
            <h2>{title}</h2>
            <p>{kind === 'orders' ? 'รายการล่าสุดจากระบบสั่งซื้อ' : 'สมาชิกที่เพิ่งสมัครเข้ามา'}</p>
          </div>
        </div>
        <Link
          href={kind === 'orders' ? '/admin/orders' : '/admin/operations?tab=customers'}
          className="report-see-all"
        >
          ดูทั้งหมด <ArrowUpRight size={14} />
        </Link>
      </div>
      {rows.slice(0, 3).map((row, index) => (
        <div className="report-simple-row" key={String(row.id || row.email || index)}>
          <span>{index + 1}</span>
          <div>
            <strong>{row.order_no || row.name || row.email || 'รายการใหม่'}</strong>
            <small>
              {row.created_at ? new Date(row.created_at).toLocaleDateString('th-TH') : 'ยังไม่มีวันที่'}
            </small>
          </div>
          <b>{kind === 'orders' ? money(row.total) : row.source || 'เว็บไซต์'}</b>
        </div>
      ))}
      {!rows.length && <div className="report-small-empty">ยังไม่มีข้อมูลจาก API ในช่วงเวลานี้</div>}
    </section>
  );
}

function AiBanner({ onAnalyze }: { onAnalyze: () => void }) {
  return (
    <section className="report-ai-banner">
      <div className="report-ai-orb">
        <Sparkles size={34} />
      </div>
      <div>
        <p>AI ASSISTANT</p>
        <h2>ให้ AI ช่วยเพิ่มยอดขายของคุณ</h2>
        <span>วิเคราะห์ข้อมูลสินค้าและแนวโน้มตลาด เพื่อแนะนำกลยุทธ์ที่เหมาะสม</span>
      </div>
      <button type="button" onClick={onAnalyze}>
        เริ่มวิเคราะห์ <ArrowUpRight size={15} />
      </button>
    </section>
  );
}

function ProductThumb({ src }: { src: unknown }) {
  const [failed, setFailed] = useState(false);
  const image = String(src || '').trim();
  return (
    <span className="report-product-thumb">
      {image && !failed ? (
        <img src={image} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <Package size={16} />
      )}
    </span>
  );
}

function Sparkline({ values, color }: { values: unknown[]; color: string }) {
  const numeric = values.map(num);
  const max = Math.max(...numeric, 1);
  const points = numeric
    .map((value, index) => `${(index / Math.max(numeric.length - 1, 1)) * 100},${30 - (value / max) * 26}`)
    .join(' ');
  const polygon = numeric.length ? `0,32 ${points} 100,32` : '0,32 100,32';
  return (
    <svg className="report-sparkline" viewBox="0 0 100 34" aria-hidden="true">
      <polygon points={polygon} fill={color} opacity=".12" />
      <polyline
        points={points || '0,30 100,30'}
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

function normalizeChannels(source: unknown) {
  const colors = ['#1677ee', '#18a5df', '#ffbf3d', '#8cdb47', '#9ba8bd'];
  const rows = Array.isArray(source)
    ? source
    : source && typeof source === 'object'
      ? Object.entries(source as Record<string, unknown>).map(([label, value]) => ({ label, value }))
      : [];
  const values = rows.map((row: any) => num(row.value ?? row.count ?? row.visitors ?? row.total));
  if (!rows.length) return [];
  const sum = Math.max(
    1,
    values.reduce((a, b) => a + b, 0),
  );
  let cursor = 0;
  return rows.slice(0, 5).map((row: any, index) => {
    const value = values[index];
    const percent = (value / sum) * 100;
    const start = cursor;
    cursor += percent;
    return {
      label: String(row.label || row.name || row.source || 'อื่น ๆ'),
      value,
      percent,
      color: colors[index],
      start,
      end: cursor,
    };
  });
}

function insightMessage(status: unknown) {
  const messages: Record<string, string> = {
    deferred: 'ระบบแยก AI ออกจากรายงานหลักเพื่อไม่ให้การโหลดตัวเลขช้าลง',
    not_configured: 'ยังไม่ได้ตั้งค่า AI Insight',
    no_data: 'ยังมีข้อมูลไม่พอสำหรับวิเคราะห์',
    upstream_error: 'บริการ AI ตอบกลับไม่สำเร็จ',
  };
  return messages[String(status || '')] || `ยังไม่มีบทวิเคราะห์ (${String(status || 'unknown')})`;
}
