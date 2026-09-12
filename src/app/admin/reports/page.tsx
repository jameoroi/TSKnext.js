import { ReportDashboard } from '@/components/admin/report-dashboard';
import { AdminPageHeader } from '@/components/admin/page-header';
import { serverLegacyRequest } from '@/server/legacy-api';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  let sales: any = { summary: {}, daily: [], top_products: [], previous: null };
  let analytics: any = { summary: {}, daily: [], top_products: [], top_pages: [], members: {}, previous: null };
  const errors: string[] = [];
  try { sales = await serverLegacyRequest<any>('admin.reports.sales', { from, to, include_previous: '1' }); }
  catch (error) { errors.push(`admin.reports.sales: ${error instanceof Error ? error.message : 'unknown_error'}`); }
  try { analytics = await serverLegacyRequest<any>('admin.analytics.report', { from, to }); }
  catch (error) { errors.push(`admin.analytics.report: ${error instanceof Error ? error.message : 'unknown_error'}`); }
  return <>
    <AdminPageHeader title="สรุปข้อมูลเว็บไซต์" description="Sales · Customer Analytics · Conversion Funnel · Profitability · AI Insight · CSV Export"/>
    <ReportDashboard initialRange={{ from, to }} initialSales={sales} initialAnalytics={analytics} initialError={errors.join(' | ')}/>
  </>;
}
