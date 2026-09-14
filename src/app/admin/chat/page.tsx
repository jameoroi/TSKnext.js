import { ChatManager } from '@/components/admin/chat-manager';
import { FacebookInbox } from '@/components/admin/facebook-inbox';
import { AdminPageHeader } from '@/components/admin/page-header';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';

export default async function Page() {
  const [data, facebook, session] = await Promise.all([
    safeLegacy<any>('telegram.chat.admin.list', {}, { conversations: [] }),
    safeLegacy<any>('facebook.conversations.list', {}, { conversations: [] }),
    getLegacySession(),
  ]);
  return (
    <>
      <AdminPageHeader
        title="แชตลูกค้า"
        description="Telegram live chat + Facebook Messenger inbox · reply · polling · audited staff communication"
      />
      <div className="grid gap-6">
        <ChatManager
          initialConversations={data.conversations || []}
          csrf={String(session.csrf || '')}
          owner={session.admin_role === 'super_admin'}
        />
        <FacebookInbox initial={facebook.conversations || []} csrf={String(session.csrf || '')} />
      </div>
    </>
  );
}
