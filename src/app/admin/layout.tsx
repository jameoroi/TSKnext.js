import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/admin-shell';
import { MuiProvider } from '@/components/admin/mui-provider';
import { requireRole } from '@/server/auth/guards';

export const metadata: Metadata = { title: 'หลังบ้าน', robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole('admin', '/admin');
  return (
    <MuiProvider>
      <AdminShell
        username={String((session as any).admin_username || 'admin')}
        owner={(session as any).admin_role === 'super_admin'}
      >
        {children}
      </AdminShell>
    </MuiProvider>
  );
}
