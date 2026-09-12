import 'server-only';
import { serverLegacyRequest } from '@/server/legacy-api';

export type LegacySession = {
  ok?: boolean;
  csrf?: string;
  admin?: Record<string, unknown> | null;
  customer?: Record<string, unknown> | null;
  agent?: Record<string, unknown> | null;
  supplier?: Record<string, unknown> | null;
  admin_role?: string;
};

export async function getLegacySession(): Promise<LegacySession> {
  try { return await serverLegacyRequest<LegacySession>('session'); }
  catch { return {}; }
}

export function roleFromSession(session: LegacySession) {
  if (session.admin) return session.admin_role === 'super_admin' ? 'owner' : 'admin';
  if (session.agent) return 'agent';
  if (session.supplier) return 'supplier';
  if (session.customer) return 'customer';
  return null;
}
