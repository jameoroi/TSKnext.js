import { AdminPageHeader } from '@/components/admin/page-header';
import { SettingsEditor } from '@/components/admin/settings-editor';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';



export default async function Page() {
  const [site, business, session] = await Promise.all([
    safeLegacy<any>('site.settings', {}, { settings: {} }),
    safeLegacy<any>('business.settings.get', {}, { settings: null }),
    getLegacySession(),
  ]);
  return <>
    <AdminPageHeader title="ตั้งค่าเว็บไซต์" description="Shop identity · Home assets · Popup · Theme · Payments · Tracking · SMTP · Telegram"/>
    <SettingsEditor settings={site.settings || {}} businessSettings={business.settings || null} csrf={String(session.csrf || '')} owner={session.admin_role === 'super_admin'}/>
  </>;
}
