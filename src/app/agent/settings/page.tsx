import type { Metadata } from 'next';
import { AgentSettingsForm } from '@/components/portal/agent-settings-form';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';

export const metadata: Metadata = { title: 'ตั้งค่าร้านตัวแทน', robots: { index: false, follow: false } };

export default async function Page() {
  const [dashboard, session, catalog] = await Promise.all([
    safeLegacy<any>('agent.dashboard', {}, { agent: {} }),
    getLegacySession(),
    safeLegacy<any>('agent.catalog.list', { q: '' }, { selected: [], candidates: [] }),
  ]);
  return (
    <AgentSettingsForm
      agent={dashboard.agent || {}}
      csrf={String(session.csrf || '')}
      initialCatalog={catalog}
    />
  );
}
