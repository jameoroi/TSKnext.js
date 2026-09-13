import { requireRole } from '@/server/auth/guards';
import './report-dashboard.css';

export default async function ReportLayout({ children }: { children: React.ReactNode }) {
  await requireRole('admin', '/admin');
  return <div className="report-workspace">{children}</div>;
}
