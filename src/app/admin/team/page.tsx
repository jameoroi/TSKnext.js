import { AdminPageHeader } from '@/components/admin/page-header';
import { TeamManager } from '@/components/admin/team-manager';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';

export default async function Page() {
  const session = await getLegacySession();
  const data = await safeLegacy<any>('admin.users.list', {}, { ok: false, users: [] });
  const role = String(session.admin_role || 'admin');
  return <><AdminPageHeader title="ทีมงานและสิทธิ์" description="Per-user admin accounts · RBAC · password rotation · audit-ready access"/><TeamManager initialRows={data.users || []} allowed={data.ok !== false && role === 'super_admin'} role={role} csrf={String(session.csrf || '')}/></>;
}
