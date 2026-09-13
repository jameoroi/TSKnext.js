import type { Metadata } from 'next';
import { ReportDashboard } from '@/components/admin/report-dashboard';
import { serverLegacyRequest } from '@/server/legacy-api';
import '../../report/report-dashboard.css';

export const metadata: Metadata = { title: 'รายงานภาพรวม | THAISERKIT SUPPLY' };
export const dynamic = 'force-dynamic';

export default async function AdminReportsPage() {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  let sales: Record<string, unknown> = { summary: {}, daily: [], top_products: [], previous: null };
  let analytics: Record<string, unknown> = {
    summary: {}, daily: [], top_products: [], top_pages: [], members: {}, previous: null,
  };
  const errors: string[] = [];
  try {
    sales = await serverLegacyRequest('admin.reports.sales', { from, to, include_previous: '1' });
  } catch (error) {
    errors.push(`admin.reports.sales: ${error instanceof Error ? error.message : 'unknown_error'}`);
  }
  try {
    analytics = await serverLegacyRequest('admin.analytics.report', { from, to });
  } catch (error) {
    errors.push(`admin.analytics.report: ${error instanceof Error ? error.message : 'unknown_error'}`);
  }
  return (
    <div className="report-workspace report-workspace--embedded">
      <ReportDashboard
        initialRange={{ from, to }}
        initialSales={sales}
        initialAnalytics={analytics}
        initialError={errors.join(' | ')}
      />
    </div>
  );
}
