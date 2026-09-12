import { AgentSettingsForm } from '@/components/portal/agent-settings-form';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';

export default async function Page() {
  const [dashboard, session, catalog] = await Promise.all([
    safeLegacy<any>('agent.dashboard', {}, { agent: {} }),
    getLegacySession(),
    safeLegacy<any>('agent.catalog.list', { q: '' }, { selected: [], candidates: [] }),
  ]);
  return <AgentSettingsForm agent={dashboard.agent || {}} csrf={String(session.csrf || '')} initialCatalog={catalog}/>;
}
