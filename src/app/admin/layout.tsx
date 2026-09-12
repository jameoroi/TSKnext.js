import { AdminShell } from '@/components/admin/admin-shell';
import { requireRole } from '@/server/auth/guards';

export default async function AdminLayout({children}:{children:React.ReactNode}){const session=await requireRole('admin','/admin');return <AdminShell username={String((session as any).admin_username||'admin')} owner={(session as any).admin_role==='super_admin'}>{children}</AdminShell>}
