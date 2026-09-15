import type { Metadata } from 'next';
import { AgentDashboard } from '@/components/portal/agent-dashboard';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';

export const metadata: Metadata = { title: 'ศูนย์ตัวแทน', robots: { index: false, follow: false } };

export default async function Page() {
  const [data, session] = await Promise.all([
    safeLegacy<any>(
      'agent.dashboard',
      {},
      { agent: {}, totals: {}, orders: [], commissions: [], payouts: [] },
    ),
    getLegacySession(),
  ]);
  return <AgentDashboard initial={data} csrf={String(session.csrf || '')} />;
}
