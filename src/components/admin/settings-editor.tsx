'use client';

import { useMemo, useState } from 'react';
import { legacyRequest } from '@/lib/legacy-api.client';
import { scaleImageFile, uploadAdminImage } from '@/lib/admin-media.client';

type Tab = 'shop' | 'popup' | 'theme' | 'payment' | 'marketing' | 'integrations' | 'email';
type Bank = { bank_name: string; account_name: string; account_no: string };

const MARKETING_KEYS = [
  'ga4_id', 'gtm_id', 'meta_pixel_id', 'tiktok_pixel_id',
  'floodlight_advertiser_id', 'floodlight_activity_group', 'floodlight_activity_tag',
  'floodlight_bot_activity_group', 'floodlight_bot_activity_tag',
] as const;

const THEME_FIELDS = [
  ['dark_1', 'สีเข้มหลัก'], ['dark_2', 'สีเข้มรอง'], ['dark_3', 'สีเข้มอ่อน'], ['pink', 'สีเน้น'],
] as const;

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('file_read_failed'));
    reader.readAsDataURL(file);
  });
}

export function SettingsEditor({
  settings,
  businessSettings,
  csrf,
  owner,
}: {
  settings: Record<string, any>;
  businessSettings: Record<string, any> | null;
  csrf: string;
  owner: boolean;
}) {
  const [tab, setTab] = useState<Tab>('shop');
  const [shop, setShop] = useState({
    site_title: String(settings.site_title || ''),
    company_name: String(settings.company_name || ''),
    company_subtitle: String(settings.company_subtitle || ''),
    logo_data_url: String(settings.logo_data_url || ''),
    favicon_data_url: String(settings.favicon_data_url || ''),
    chat_avatar_data_url: String(settings.chat_avatar_data_url || ''),
  });
  const [homeCards, setHomeCards] = useState({
    featured_image_url: String(settings.home_cards?.featured_image_url || ''),
    articles_image_url: String(settings.home_cards?.articles_image_url || ''),
    about_image_url: String(settings.home_cards?.about_image_url || ''),
  });
  const [homeHeadings, setHomeHeadings] = useState({
    bestseller: String(settings.home_headings?.bestseller || ''),
    flash: String(settings.home_headings?.flash || ''),
    promotion: String(settings.home_headings?.promotion || ''),
  });
  const [popup, setPopup] = useState({
    enabled: Boolean(settings.entry_popup?.enabled),
    image_url: String(settings.entry_popup?.image_url || ''),
    link_url: String(settings.entry_popup?.link_url || ''),
    alt_text: String(settings.entry_popup?.alt_text || ''),
    frequency: String(settings.entry_popup?.frequency || 'session'),
    delay_ms: Number(settings.entry_popup?.delay_ms || 700),
    start_at: String(settings.entry_popup?.start_at || ''),
    end_at: String(settings.entry_popup?.end_at || ''),
  });
  const [theme, setTheme] = useState<Record<string, string>>(() => {
    const initial = { ...(settings.theme || {}) };
    for (const [key] of THEME_FIELDS) if (!initial[key]) initial[key] = '#0b2e22';
    return initial;
  });
  const [marketing, setMarketing] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const key of MARKETING_KEYS) out[key] = String(settings.marketing?.[key] || '');
    return out;
  });
  const [payment, setPayment] = useState<Record<string, any>>({
    promptpay_id: '', promptpay_name: '', bank_transfer_enabled: true, cod_enabled: true,
    line_order_enabled: false, line_oa_url: '', line_oa_name: '', omise_public_key: '', omise_secret_key: '',
    ...(businessSettings?.payment || {}),
    bank_accounts: Array.isArray(businessSettings?.payment?.bank_accounts) ? businessSettings!.payment.bank_accounts.map((x: any) => ({ ...x })) : [],
  });
  const [email, setEmail] = useState<Record<string, any>>({ smtp_host: '', smtp_port: 587, smtp_secure: false, smtp_user: '', smtp_pass: '', from_name: '', from_email: '', ...(businessSettings?.email || {}) });
  const [notifications, setNotifications] = useState<Record<string, any>>({
    telegram_alert_bot_token: '', telegram_alert_chat_id: '', telegram_chat_bot_token: '', telegram_chat_chat_id: '',
    telegram_bot_token: '', telegram_chat_id: '', order_notify_email: '', ...(businessSettings?.notifications || {}),
  });
  const [facebook, setFacebook] = useState<Record<string, string>>({
    page_id: '', page_username: '', page_access_token: '', verify_token: '', ...(businessSettings?.facebook || {}),
  });
  const [shopee, setShopee] = useState<Record<string, string>>({
    partner_id: '', partner_key: '', shop_id: '', redirect_url: '', ...(businessSettings?.shopee || {}),
  });
  const [lazada, setLazada] = useState<Record<string, string>>({
    app_key: '', app_secret: '', country: 'th', redirect_url: '', ...(businessSettings?.lazada || {}),
  });
  const [testEmailTo, setTestEmailTo] = useState(String(businessSettings?.email?.from_email || ''));
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [uploading, setUploading] = useState('');

  const tabs = useMemo(() => [
    { key: 'shop' as Tab, label: 'ข้อมูลร้านและโลโก้' },
    { key: 'popup' as Tab, label: 'ป๊อปอัพหน้าแรก' },
    { key: 'theme' as Tab, label: 'ธีมสี' },
    ...(owner ? [
      { key: 'payment' as Tab, label: 'การชำระเงิน' },
      { key: 'marketing' as Tab, label: 'Tracking / Chat' },
      { key: 'integrations' as Tab, label: 'Marketplace / Facebook' },
      { key: 'email' as Tab, label: 'อีเมลและแจ้งเตือน' },
    ] : []),
  ], [owner]);

  async function run(key: string, success: string, work: () => Promise<void>) {
    setBusy(key); setNotice(null);
    try { await work(); setNotice({ kind: 'ok', text: success }); }
    catch (error) { setNotice({ kind: 'bad', text: error instanceof Error ? error.message : 'settings_error' }); }
    finally { setBusy(''); }
  }

  async function pickInline(target: keyof typeof shop | 'popup', file: File) {
    setUploading(String(target));
    try {
      const data = await fileToDataUrl(file);
      if (target === 'popup') setPopup((x) => ({ ...x, image_url: data }));
      else setShop((x) => ({ ...x, [target]: data }));
    } finally { setUploading(''); }
  }

  async function pickManagedCard(target: keyof typeof homeCards, file: File) {
    setUploading(target); setNotice(null);
    try {
      const max = target === 'about_image_url' ? 1400 : 600;
      const prepared = await scaleImageFile(file, max);
      const url = await uploadAdminImage(prepared, { ownerType: target === 'about_image_url' ? 'site-about' : 'site-home-card', csrf });
      setHomeCards((current) => ({ ...current, [target]: url }));
    } catch (error) {
      setNotice({ kind: 'bad', text: `อัปโหลดไม่สำเร็จ: ${error instanceof Error ? error.message : 'upload_failed'}` });
    } finally { setUploading(''); }
  }

  const saveShop = () => run('shop', 'บันทึกข้อมูลร้านและหน้าแรกแล้ว', async () => {
    await legacyRequest('admin.site.settings', { ...shop, home_cards: homeCards, home_headings: homeHeadings, csrf }, 'POST');
  });
  const savePopup = () => run('popup', 'บันทึกป๊อปอัพแล้ว', async () => {
    await legacyRequest('admin.site.settings', { entry_popup: popup, csrf }, 'POST');
  });
  const saveTheme = () => run('theme', 'บันทึกธีมแล้ว', async () => {
    await legacyRequest('admin.theme.settings', { theme, csrf }, 'POST');
  });
  const resetTheme = () => run('theme-reset', 'คืนค่าธีมเริ่มต้นแล้ว', async () => {
    await legacyRequest('admin.theme.reset', { csrf }, 'POST');
    window.location.reload();
  });
  const saveMarketing = () => run('marketing', 'บันทึก Tracking IDs แล้ว', async () => {
    await legacyRequest('admin.site.settings', { marketing, csrf }, 'POST');
  });
  const saveBusiness = (key: string, message: string) => run(key, message, async () => {
    await legacyRequest('business.settings.save', { payment, email, notifications, facebook, shopee, lazada, csrf }, 'POST');
  });
  const testEmail = () => run('test-email', 'ส่งอีเมลทดสอบแล้ว', async () => {
    await legacyRequest('business.settings.test_email', { to: testEmailTo.trim(), csrf }, 'POST');
  });
  const testOrderTelegram = () => run('test-order-telegram', 'ส่งข้อความทดสอบบอทแจ้งเตือนออเดอร์แล้ว', async () => {
    await legacyRequest('admin.production.test_telegram', { csrf }, 'POST');
  });
  const testChatTelegram = () => run('test-chat-telegram', 'ส่งข้อความทดสอบบอทแชทแล้ว', async () => {
    await legacyRequest('telegram.chat.test', { csrf }, 'POST');
  });
  const setupChat = () => run('setup-chat', 'เชื่อม Telegram webhook แล้ว', async () => {
    await legacyRequest('telegram.chat.setup', { csrf }, 'POST');
  });

  const field = 'h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-emerald-700';
  const card = 'rounded-2xl border bg-white p-6 shadow-sm';

  return <div className="grid gap-5">
    <div className="flex gap-2 overflow-x-auto pb-1">{tabs.map((item) => <button key={item.key} onClick={() => setTab(item.key)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-bold ${tab === item.key ? 'bg-emerald-950 text-white' : 'border bg-white'}`}>{item.label}</button>)}</div>
    {notice && <p className={`rounded-2xl border p-4 text-sm font-semibold ${notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{notice.text}</p>}

    {tab === 'shop' && <div className="grid gap-5 xl:grid-cols-2">
      <section className={card}><h2 className="text-lg font-bold">ตัวตนของร้าน</h2><div className="mt-4 grid gap-4">{([
        ['site_title', 'ชื่อเว็บไซต์'], ['company_name', 'ชื่อบริษัท'], ['company_subtitle', 'คำโปรย'],
      ] as const).map(([key, label]) => <label key={key} className="grid gap-1"><span className="text-sm font-semibold">{label}</span><input value={shop[key]} onChange={(e) => setShop({ ...shop, [key]: e.target.value })} className={field}/></label>)}
      {([
        ['logo_data_url', 'โลโก้'], ['favicon_data_url', 'Favicon'], ['chat_avatar_data_url', 'รูปแชท'],
      ] as const).map(([key, label]) => <label key={key} className="grid gap-2"><span className="text-sm font-semibold">{label}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(e) => { const file = e.target.files?.[0]; e.currentTarget.value = ''; if (file) void pickInline(key, file); }} className="rounded-xl border p-2 text-xs"/>{shop[key] && <img src={shop[key]} alt={label} className="h-20 w-full rounded-xl border bg-slate-50 object-contain p-2"/>}</label>)}</div></section>

      <section className={card}><h2 className="text-lg font-bold">รูปหน้าแรก</h2><p className="mt-1 text-sm text-slate-500">เก็บใน managed media / S3 ไม่ฝังไฟล์ใหญ่ใน settings</p><div className="mt-4 grid gap-4">{([
        ['featured_image_url', 'การ์ดสินค้าขายดี'], ['articles_image_url', 'การ์ดบทความ'], ['about_image_url', 'รูปหน้าเกี่ยวกับเรา'],
      ] as const).map(([key, label]) => <label key={key} className="grid gap-2"><span className="text-sm font-semibold">{label}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={(e) => { const file = e.target.files?.[0]; e.currentTarget.value = ''; if (file) void pickManagedCard(key, file); }} className="rounded-xl border p-2 text-xs"/>{homeCards[key] && <img src={homeCards[key]} alt={label} className="h-28 w-full rounded-xl border bg-slate-50 object-contain"/>}</label>)}</div></section>

      <section className={`${card} xl:col-span-2`}><h2 className="text-lg font-bold">ชื่อชั้นหน้าแรก</h2><div className="mt-4 grid gap-4 md:grid-cols-3">{([
        ['bestseller', 'สินค้าขายดี'], ['flash', 'Flash Sale'], ['promotion', 'โปรโมชั่น'],
      ] as const).map(([key, label]) => <label key={key}><span className="mb-1 block text-sm font-semibold">{label}</span><input value={homeHeadings[key]} onChange={(e) => setHomeHeadings({ ...homeHeadings, [key]: e.target.value })} className={field}/></label>)}</div><button onClick={saveShop} disabled={busy === 'shop' || Boolean(uploading)} className="mt-5 rounded-xl bg-emerald-950 px-4 py-2.5 font-bold text-white disabled:opacity-50">{busy === 'shop' ? 'กำลังบันทึก…' : 'บันทึกข้อมูลร้าน'}</button></section>
    </div>}

    {tab === 'popup' && <section className={card}><h2 className="text-lg font-bold">Entry Popup</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="flex items-center gap-2 text-sm font-semibold md:col-span-2"><input type="checkbox" checked={popup.enabled} onChange={(e) => setPopup({ ...popup, enabled: e.target.checked })}/> เปิดใช้งาน</label><label className="grid gap-1 md:col-span-2"><span className="text-sm font-semibold">ภาพ</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { const file = e.target.files?.[0]; e.currentTarget.value = ''; if (file) void pickInline('popup', file); }} className="rounded-xl border p-2 text-xs"/>{popup.image_url && <img src={popup.image_url} alt="popup" className="mt-2 max-h-72 w-full rounded-xl border object-contain"/>}</label><label><span className="mb-1 block text-sm font-semibold">ลิงก์เมื่อคลิก</span><input value={popup.link_url} onChange={(e) => setPopup({ ...popup, link_url: e.target.value })} className={field}/></label><label><span className="mb-1 block text-sm font-semibold">Alt text</span><input value={popup.alt_text} onChange={(e) => setPopup({ ...popup, alt_text: e.target.value })} className={field}/></label><label><span className="mb-1 block text-sm font-semibold">ความถี่</span><select value={popup.frequency} onChange={(e) => setPopup({ ...popup, frequency: e.target.value })} className={field}><option value="session">ต่อ session</option><option value="daily">วันละครั้ง</option><option value="always">ทุกครั้ง</option></select></label><label><span className="mb-1 block text-sm font-semibold">Delay (ms)</span><input type="number" min={0} max={30000} value={popup.delay_ms} onChange={(e) => setPopup({ ...popup, delay_ms: Number(e.target.value) || 0 })} className={field}/></label><label><span className="mb-1 block text-sm font-semibold">เริ่ม</span><input type="datetime-local" value={popup.start_at} onChange={(e) => setPopup({ ...popup, start_at: e.target.value })} className={field}/></label><label><span className="mb-1 block text-sm font-semibold">สิ้นสุด</span><input type="datetime-local" value={popup.end_at} onChange={(e) => setPopup({ ...popup, end_at: e.target.value })} className={field}/></label></div><button onClick={savePopup} disabled={busy === 'popup'} className="mt-5 rounded-xl bg-emerald-950 px-4 py-2.5 font-bold text-white">บันทึกป๊อปอัพ</button></section>}

    {tab === 'theme' && <section className={card}><h2 className="text-lg font-bold">Theme Tokens</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{THEME_FIELDS.map(([key, label]) => <label key={key} className="rounded-xl border p-3"><span className="text-sm font-semibold">{label}</span><div className="mt-2 flex items-center gap-3"><input type="color" value={theme[key] || '#0b2e22'} onChange={(e) => setTheme({ ...theme, [key]: e.target.value })} className="h-10 w-14 rounded border"/><code className="text-xs">{theme[key]}</code></div></label>)}</div><div className="mt-5 flex gap-2"><button onClick={saveTheme} disabled={busy === 'theme'} className="rounded-xl bg-emerald-950 px-4 py-2.5 font-bold text-white">บันทึกธีม</button><button onClick={resetTheme} disabled={busy === 'theme-reset'} className="rounded-xl border px-4 py-2.5 font-bold">คืนค่าเริ่มต้น</button></div></section>}

    {tab === 'payment' && owner && <section className={card}><h2 className="text-lg font-bold">การชำระเงิน</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={payment.bank_transfer_enabled !== false} onChange={(e) => setPayment({ ...payment, bank_transfer_enabled: e.target.checked })}/> โอนธนาคาร</label><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(payment.cod_enabled)} onChange={(e) => setPayment({ ...payment, cod_enabled: e.target.checked })}/> COD</label><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(payment.line_order_enabled)} onChange={(e) => setPayment({ ...payment, line_order_enabled: e.target.checked })}/> สั่งผ่าน LINE</label><div/><label><span className="mb-1 block text-sm font-semibold">PromptPay ID</span><input value={payment.promptpay_id || ''} onChange={(e) => setPayment({ ...payment, promptpay_id: e.target.value })} className={field}/></label><label><span className="mb-1 block text-sm font-semibold">ชื่อ PromptPay</span><input value={payment.promptpay_name || ''} onChange={(e) => setPayment({ ...payment, promptpay_name: e.target.value })} className={field}/></label><label><span className="mb-1 block text-sm font-semibold">LINE OA URL</span><input value={payment.line_oa_url || ''} onChange={(e) => setPayment({ ...payment, line_oa_url: e.target.value })} className={field}/></label><label><span className="mb-1 block text-sm font-semibold">LINE OA Name</span><input value={payment.line_oa_name || ''} onChange={(e) => setPayment({ ...payment, line_oa_name: e.target.value })} className={field}/></label><label><span className="mb-1 block text-sm font-semibold">Omise / Opn Public Key</span><input value={payment.omise_public_key || ''} onChange={(e) => setPayment({ ...payment, omise_public_key: e.target.value })} className={field}/></label><label><span className="mb-1 block text-sm font-semibold">Omise / Opn Secret Key</span><input type="password" value={payment.omise_secret_key || ''} onChange={(e) => setPayment({ ...payment, omise_secret_key: e.target.value })} className={field}/></label></div><div className="mt-6"><div className="flex items-center justify-between"><h3 className="font-bold">บัญชีธนาคาร</h3><button onClick={() => setPayment({ ...payment, bank_accounts: [...(payment.bank_accounts || []), { bank_name: '', account_name: '', account_no: '' }] })} type="button" className="rounded-lg border px-3 py-1.5 text-xs font-bold">+ เพิ่มบัญชี</button></div><div className="mt-3 grid gap-3">{(payment.bank_accounts || []).map((bank: Bank, index: number) => <div key={index} className="grid gap-2 rounded-xl border p-3 md:grid-cols-[1fr_1fr_1fr_auto]">{(['bank_name', 'account_name', 'account_no'] as const).map((key) => <input key={key} value={bank[key] || ''} placeholder={key === 'bank_name' ? 'ธนาคาร' : key === 'account_name' ? 'ชื่อบัญชี' : 'เลขบัญชี'} onChange={(e) => { const rows = [...payment.bank_accounts]; rows[index] = { ...rows[index], [key]: e.target.value }; setPayment({ ...payment, bank_accounts: rows }); }} className="h-10 rounded-lg border px-3 text-sm"/>)}<button onClick={() => setPayment({ ...payment, bank_accounts: payment.bank_accounts.filter((_: any, i: number) => i !== index) })} className="rounded-lg border border-red-200 px-3 text-xs font-bold text-red-700">ลบ</button></div>)}</div></div><button onClick={() => saveBusiness('payment', 'บันทึกช่องทางชำระเงินแล้ว')} className="mt-5 rounded-xl bg-emerald-950 px-4 py-2.5 font-bold text-white">บันทึกการชำระเงิน</button></section>}

    {tab === 'marketing' && owner && <section className={card}><h2 className="text-lg font-bold">Tracking IDs</h2><p className="mt-1 text-sm text-slate-500">รับเฉพาะ ID ไม่รับ script snippet</p><div className="mt-4 grid gap-4 md:grid-cols-2">{MARKETING_KEYS.map((key) => <label key={key}><span className="mb-1 block text-xs font-bold uppercase text-slate-500">{key}</span><input value={marketing[key] || ''} onChange={(e) => setMarketing({ ...marketing, [key]: e.target.value })} className={field}/></label>)}</div><button onClick={saveMarketing} className="mt-5 rounded-xl bg-emerald-950 px-4 py-2.5 font-bold text-white">บันทึก Tracking</button></section>}

    {tab === 'integrations' && owner && <div className="grid gap-5 xl:grid-cols-2">
      <section className={card}><h2 className="text-lg font-bold">Shopee Open Platform</h2><p className="mt-1 text-sm text-slate-500">ตั้งค่าก่อนเชื่อม OAuth ที่หน้า Marketplace · Secret ที่แสดงเป็น •••••••• หมายถึงระบบมีค่าเดิมและจะเก็บไว้ถ้าไม่แก้</p><div className="mt-4 grid gap-4">{([
        ['partner_id', 'Partner ID', 'text'], ['partner_key', 'Partner Key', 'password'], ['shop_id', 'Shop ID', 'text'], ['redirect_url', 'Redirect URL', 'url'],
      ] as const).map(([key, label, type]) => <label key={key}><span className="mb-1 block text-sm font-semibold">{label}</span><input type={type} value={String(shopee[key] || '')} onChange={(e) => setShopee({ ...shopee, [key]: e.target.value })} className={field}/></label>)}</div></section>
      <section className={card}><h2 className="text-lg font-bold">Lazada Open Platform</h2><p className="mt-1 text-sm text-slate-500">App Key / Secret และ Callback URL สำหรับ OAuth ของร้าน</p><div className="mt-4 grid gap-4">{([
        ['app_key', 'App Key', 'text'], ['app_secret', 'App Secret', 'password'], ['country', 'Country code', 'text'], ['redirect_url', 'Redirect URL', 'url'],
      ] as const).map(([key, label, type]) => <label key={key}><span className="mb-1 block text-sm font-semibold">{label}</span><input type={type} value={String(lazada[key] || '')} onChange={(e) => setLazada({ ...lazada, [key]: e.target.value })} className={field}/></label>)}</div></section>
      <section className={card}><h2 className="text-lg font-bold">Facebook Page / Messenger</h2><p className="mt-1 text-sm text-slate-500">ใช้รับ Webhook, แสดง Messenger shortcut และตอบข้อความจาก Facebook Inbox ในหลังบ้าน</p><div className="mt-4 grid gap-4">{([
        ['page_id', 'Page ID', 'text'], ['page_username', 'Page Username', 'text'], ['page_access_token', 'Page Access Token', 'password'], ['verify_token', 'Webhook Verify Token', 'password'],
      ] as const).map(([key, label, type]) => <label key={key}><span className="mb-1 block text-sm font-semibold">{label}</span><input type={type} value={String(facebook[key] || '')} onChange={(e) => setFacebook({ ...facebook, [key]: e.target.value })} className={field}/></label>)}</div></section>
      <section className={card}><h2 className="text-lg font-bold">Integration workflow</h2><div className="mt-4 grid gap-3 text-sm text-slate-600"><p className="rounded-xl bg-slate-50 p-3"><b>1.</b> บันทึก Credentials ที่นี่</p><p className="rounded-xl bg-slate-50 p-3"><b>2.</b> ไปที่ Shopee / Lazada เพื่อเชื่อม OAuth</p><p className="rounded-xl bg-slate-50 p-3"><b>3.</b> ดึงสินค้า → Preview mapping → Import หรือ Sync</p><p className="rounded-xl bg-slate-50 p-3"><b>4.</b> Facebook Webhook ใช้ <code>/api/facebook-webhook</code></p></div></section>
      <button onClick={() => saveBusiness('integrations', 'บันทึก Marketplace / Facebook แล้ว')} disabled={busy === 'integrations'} className="xl:col-span-2 rounded-xl bg-emerald-950 px-4 py-2.5 font-bold text-white disabled:opacity-50">{busy === 'integrations' ? 'กำลังบันทึก…' : 'บันทึก Marketplace / Facebook'}</button>
    </div>}

    {tab === 'email' && owner && <div className="grid gap-5 xl:grid-cols-2"><section className={card}><h2 className="text-lg font-bold">SMTP</h2><div className="mt-4 grid gap-4">{([
      ['smtp_host', 'SMTP host', 'text'], ['smtp_port', 'Port', 'number'], ['smtp_user', 'Username', 'text'], ['smtp_pass', 'Password', 'password'], ['from_name', 'ชื่อผู้ส่ง', 'text'], ['from_email', 'อีเมลผู้ส่ง', 'email'],
    ] as const).map(([key, label, type]) => <label key={key}><span className="mb-1 block text-sm font-semibold">{label}</span><input type={type} value={String(email[key] ?? '')} onChange={(e) => setEmail({ ...email, [key]: type === 'number' ? Number(e.target.value) : e.target.value })} className={field}/></label>)}<label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={Boolean(email.smtp_secure)} onChange={(e) => setEmail({ ...email, smtp_secure: e.target.checked })}/> SMTP Secure</label><div className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_auto]"><input type="email" value={testEmailTo} onChange={(e) => setTestEmailTo(e.target.value)} placeholder="อีเมลปลายทางสำหรับทดสอบ" className={field}/><button type="button" onClick={testEmail} disabled={busy === 'test-email'} className="rounded-xl border bg-white px-3 py-2 text-sm font-bold disabled:opacity-50">{busy === 'test-email' ? 'กำลังส่ง…' : 'ทดสอบ SMTP'}</button></div></div></section><section className={card}><h2 className="text-lg font-bold">Telegram / Order notifications</h2><div className="mt-4 grid gap-4">{([
      ['order_notify_email', 'อีเมลรับแจ้งออเดอร์', 'email'], ['telegram_alert_bot_token', 'Order bot token', 'password'], ['telegram_alert_chat_id', 'Order chat ID', 'text'], ['telegram_chat_bot_token', 'Chat bot token', 'password'], ['telegram_chat_chat_id', 'Chat room ID', 'text'],
    ] as const).map(([key, label, type]) => <label key={key}><span className="mb-1 block text-sm font-semibold">{label}</span><input type={type} value={String(notifications[key] || '')} onChange={(e) => setNotifications({ ...notifications, [key]: e.target.value })} className={field}/></label>)}<div className="flex flex-wrap gap-2"><button onClick={testOrderTelegram} className="rounded-xl border px-3 py-2 text-sm font-bold">ทดสอบ Order bot</button><button onClick={testChatTelegram} className="rounded-xl border px-3 py-2 text-sm font-bold">ทดสอบ Chat bot</button><button onClick={setupChat} className="rounded-xl border px-3 py-2 text-sm font-bold">ตั้ง Webhook</button></div></div></section><button onClick={() => saveBusiness('email', 'บันทึกอีเมลและการแจ้งเตือนแล้ว')} className="xl:col-span-2 rounded-xl bg-emerald-950 px-4 py-2.5 font-bold text-white">บันทึก Email / Notifications</button></div>}
  </div>;
}
