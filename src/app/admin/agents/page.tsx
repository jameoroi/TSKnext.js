import { AgentManager } from '@/components/admin/agent-manager';
import { AdminPageHeader } from '@/components/admin/page-header';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';
export default async function Page() {
  const [d, s] = await Promise.all([
    safeLegacy<{
      agents?: Array<Record<string, unknown>>;
      applications?: Array<Record<string, unknown>>;
      levels?: Array<Record<string, unknown>>;
    }>('admin.agents.list', {}, { agents: [], applications: [], levels: [] }),
    getLegacySession(),
  ]);
  return (
    <>
      <AdminPageHeader
        title="ตัวแทนจำหน่าย"
        description="Applications · approved agents · tier ladder · commission overrides"
      />
      <AgentManager initial={d} csrf={String(s.csrf || '')} />
    </>
  );
}
