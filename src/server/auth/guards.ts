import 'server-only';
import { redirect } from 'next/navigation';
import { getLegacySession } from './legacy-session';

export async function requireRole(
  role: 'admin' | 'owner' | 'agent' | 'supplier' | 'customer',
  returnTo = '/',
) {
  const session = await getLegacySession();
  const signedIn =
    role === 'owner'
      ? Boolean(session.admin && session.admin_role === 'super_admin')
      : role === 'admin'
        ? Boolean(session.admin)
        : Boolean(session[role]);
  if (!signedIn)
    redirect(`/login?role=${role === 'customer' ? '' : role}&redirect=${encodeURIComponent(returnTo)}`);
  if (role === 'owner' && session.admin_role !== 'super_admin') redirect('/admin');
  return session;
}
