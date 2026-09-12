import { AdminShell } from '@/components/admin/admin-shell';
import { requireRole } from '@/server/auth/guards';

export default async function ReportLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole('admin', '/admin');
  return (
    <AdminShell
      username={String((session as unknown as Record<string, unknown>).admin_username || 'admin')}
      owner={(session as unknown as Record<string, unknown>).admin_role === 'super_admin'}
    >
      {children}
    </AdminShell>
  );
}
