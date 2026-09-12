import { AlertTriangle, Database, Search, ServerCog, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { revalidateCommerce } from '@/app/actions';
import { AdminPageHeader, MetricGrid } from '@/components/admin/page-header';
import { serverLegacyRequest } from '@/server/legacy-api';
import { databaseConfigured } from '@/server/db/client';

export default async function AdminDashboard() {
  let data: any = { metrics: {} };
  let integrity: any = { status: 'unknown' };
  const apiErrors: string[] = [];
  try { data = await serverLegacyRequest<any>('admin.dashboard.metrics'); }
  catch (error) { apiErrors.push(`dashboard: ${error instanceof Error ? error.message : 'unknown_error'}`); }
  try { integrity = await serverLegacyRequest<any>('admin.catalog.integrity'); }
  catch (error) { apiErrors.push(`catalog: ${error instanceof Error ? error.message : 'unknown_error'}`); }

  const services = [
    ['PostgreSQL', databaseConfigured(), Database],
    ['Commerce API', Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY), ServerCog],
    ['Meilisearch', Boolean(process.env.MEILISEARCH_HOST), Search],
    ['OpenAI', Boolean(process.env.OPENAI_API_KEY), Sparkles],
  ] as const;
  const shortcuts = [
    ['/admin/orders', 'คำสั่งซื้อ', 'ตรวจสลิป อัปเดตสถานะ และเลขพัสดุ'],
    ['/admin/products', 'สินค้า', 'เพิ่ม แก้ไข และจัดการแคตตาล็อก'],
    ['/admin/inventory', 'คลังสินค้า', 'สต็อก การจอง และประวัติปรับยอด'],
    ['/admin/kits', 'ชุดอุปกรณ์ / Bundle', 'สร้างชุดสำเร็จรูปสำหรับลูกค้าและ AI Builder'],
    ['/admin/reports', 'Reports & Analytics', 'ยอดขาย Traffic Funnel กำไร และ AI Insight'],
    ['/admin/operations?tab=customers', 'ลูกค้า / CRM', 'ลูกค้า โน้ต รีวิว คืนสินค้า และบริการหลังการขาย'],
    ['/admin/content', 'เนื้อหา', 'แบนเนอร์ ข่าว บทความ และวิดีโอ'],
    ['/admin/agents', 'ตัวแทน', 'อนุมัติและดูผลงานตัวแทน'],
    ['/admin/settings', 'ตั้งค่าระบบ', 'ร้านค้า การชำระเงิน อีเมล และธีม'],
  ];

  return <>
    <AdminPageHeader title="ศูนย์ผู้ดูแลระบบ" description="Next.js 16 Control Center · Commerce · Inventory · CRM · Reports · AI · Bundle Builder" actions={<><form action={revalidateCommerce}><button className="rounded-xl border bg-white px-3 py-1.5 text-xs font-bold">Revalidate</button></form><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${integrity.status === 'healthy' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>Catalog: {integrity.status}</span></>}/>

    {apiErrors.length ? <section className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900" role="alert"><AlertTriangle className="mt-0.5 size-5 shrink-0"/><div><strong className="text-sm">ข้อมูลหลังบ้านเชื่อมต่อไม่ครบ — ระบบจะไม่แสดงตัวเลขศูนย์ปลอมเป็นข้อมูลจริง</strong><p className="mt-1 text-xs leading-5">{apiErrors.join(' · ')}</p><p className="mt-1 text-xs">ตรวจ `.env.local`, `/api/health`, Commerce API และ DATABASE_URL ก่อนใช้งาน production</p></div></section> : null}

    <section className="mb-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{services.map(([name, ready, Icon]) => <div key={name} className="flex items-center gap-3 rounded-2xl border bg-white p-3 shadow-sm"><span className={`grid size-9 place-items-center rounded-xl ${ready ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-700'}`}><Icon size={17}/></span><div><strong className="block text-sm">{name}</strong><span className={`text-xs font-bold ${ready ? 'text-emerald-700' : 'text-amber-700'}`}>{ready ? 'configured' : 'not configured'}</span></div></div>)}</section>

    <MetricGrid metrics={data.metrics || {}}/>
    <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{shortcuts.map(([href, title, note]) => <Link href={href} key={href} className="rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><h2 className="font-bold">{title}</h2><p className="mt-1 text-sm text-slate-500">{note}</p></Link>)}</section>
  </>;
}
