import { CrmManager } from '@/components/admin/crm-manager';
import { AdminPageHeader } from '@/components/admin/page-header';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';

export default async function CrmPage() {
  const [contacts, newsletter, session] = await Promise.all([
    safeLegacy<any>('admin.contacts.list', {}, { contacts: [], error: 'contacts_unavailable' }),
    safeLegacy<any>('admin.newsletter.list', {}, { subscribers: [], error: 'newsletter_unavailable' }),
    getLegacySession(),
  ]);
  return (
    <>
      <AdminPageHeader
        eyebrow="CRM / LIFECYCLE"
        title="ลูกค้า ติดต่อ และ Newsletter"
        description="Contact inbox · direct email · subscriber list · newsletter broadcast"
      />
      <CrmManager
        initialContacts={Array.isArray(contacts.contacts) ? contacts.contacts : []}
        initialSubscribers={Array.isArray(newsletter.subscribers) ? newsletter.subscribers : []}
        csrf={String(session.csrf || '')}
        owner={session.admin_role === 'super_admin'}
        initialWarnings={[contacts.error, newsletter.error].filter(Boolean).map(String)}
      />
    </>
  );
}
