import { ContentManager } from '@/components/admin/content-manager';
import { AdminPageHeader } from '@/components/admin/page-header';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';



export default async function Page() {
  const [site, news, article, video, session] = await Promise.all([
    safeLegacy<any>('site.settings', { compact: 1 }, { settings: {} }),
    safeLegacy<any>('admin.content.list', { kind: 'news' }, { items: [] }),
    safeLegacy<any>('admin.content.list', { kind: 'article' }, { items: [] }),
    safeLegacy<any>('admin.content.list', { kind: 'video' }, { items: [] }),
    getLegacySession(),
  ]);

  return <>
    <AdminPageHeader title="เนื้อหาหน้าแรก" description="Banner Studio · News · Articles · Videos · Managed Media"/>
    <ContentManager
      initialSettings={site.settings || {}}
      initialItems={{ news: news.items || [], article: article.items || [], video: video.items || [] }}
      csrf={String(session.csrf || '')}
    />
  </>;
}
