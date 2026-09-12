'use client';

import { Mail, Megaphone, RefreshCcw, Search, Send, UsersRound } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { legacyRequest, LegacyApiError } from '@/lib/legacy-api.client';

type Row = Record<string, any>;
const when = (value: unknown) => value ? new Date(String(value)).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

function friendly(error: unknown) {
  const key = error instanceof LegacyApiError ? error.code : error instanceof Error ? error.message : 'unknown_error';
  const messages: Record<string, string> = {
    unauthorized: 'เซสชันหมดอายุหรือไม่มีสิทธิ์ใช้งาน',
    invalid_csrf: 'CSRF token ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่',
    invalid_input: 'กรุณากรอกข้อมูลให้ครบและถูกต้อง',
    smtp_not_configured: 'ยังไม่ได้ตั้งค่า SMTP ในหน้าตั้งค่าระบบ',
    send_failed: 'ส่งอีเมลไม่สำเร็จ กรุณาตรวจการตั้งค่า SMTP',
    forbidden_super_admin_only: 'การส่ง Newsletter ใช้ได้เฉพาะ Super Admin',
  };
  return messages[key] || key;
}

export function CrmManager({ initialContacts, initialSubscribers, csrf, owner, initialWarnings = [] }: {
  initialContacts: Row[];
  initialSubscribers: Row[];
  csrf: string;
  owner: boolean;
  initialWarnings?: string[];
}) {
  const [contacts, setContacts] = useState(initialContacts);
  const [subscribers, setSubscribers] = useState(initialSubscribers);
  const [query, setQuery] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [newsletterSubject, setNewsletterSubject] = useState('');
  const [newsletterMessage, setNewsletterMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(initialWarnings.length ? `บางแหล่งข้อมูลยังไม่พร้อม: ${initialWarnings.join(', ')}` : '');

  const filteredContacts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((row) => [row.name, row.email, row.phone, row.subject, row.message].some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [contacts, query]);
  const activeSubscribers = useMemo(() => subscribers.filter((row) => row.status !== 'unsubscribed' && row.status !== 'inactive'), [subscribers]);

  function clearMessages() { setNotice(''); setError(''); }

  async function reload() {
    setBusy('reload'); clearMessages();
    try {
      const [contactData, subscriberData] = await Promise.all([
        legacyRequest<any>('admin.contacts.list'),
        legacyRequest<any>('admin.newsletter.list'),
      ]);
      setContacts(Array.isArray(contactData.contacts) ? contactData.contacts : []);
      setSubscribers(Array.isArray(subscriberData.subscribers) ? subscriberData.subscribers : []);
      setNotice('รีเฟรช CRM แล้ว');
    } catch (err) { setError(friendly(err)); }
    finally { setBusy(''); }
  }

  async function sendDirect(event: FormEvent) {
    event.preventDefault();
    setBusy('direct'); clearMessages();
    try {
      await legacyRequest('email.send', { to: emailTo.trim(), subject: emailSubject.trim(), message: emailMessage.trim(), csrf }, 'POST');
      setNotice(`ส่งอีเมลไปที่ ${emailTo.trim()} แล้ว`);
      setEmailSubject(''); setEmailMessage('');
    } catch (err) { setError(friendly(err)); }
    finally { setBusy(''); }
  }

  async function sendNewsletter(event: FormEvent) {
    event.preventDefault();
    if (!owner) { setError('การส่ง Newsletter ใช้ได้เฉพาะ Super Admin'); return; }
    if (!window.confirm(`ยืนยันส่ง Newsletter ถึงสมาชิกที่ Active ประมาณ ${activeSubscribers.length.toLocaleString('th-TH')} ราย?`)) return;
    setBusy('newsletter'); clearMessages();
    try {
      const result = await legacyRequest<any>('admin.newsletter.send', { subject: newsletterSubject.trim(), message: newsletterMessage.trim(), csrf }, 'POST');
      setNotice(`ส่ง Newsletter แล้ว ${Number(result.sent || 0).toLocaleString('th-TH')} อีเมล`);
      setNewsletterSubject(''); setNewsletterMessage('');
    } catch (err) { setError(friendly(err)); }
    finally { setBusy(''); }
  }

  function replyTo(contact: Row) {
    setEmailTo(String(contact.email || ''));
    setEmailSubject(`Re: ${String(contact.subject || 'ติดต่อ THAISERKIT SUPPLY')}`);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  return <div className="space-y-6">
    {notice && <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{notice}</p>}
    {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800" role="alert">{error}</p>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<Mail size={18}/>} label="Contact Inbox" value={String(contacts.length)} note="ข้อความจากแบบฟอร์มติดต่อ"/>
      <Metric icon={<UsersRound size={18}/>} label="Subscribers" value={String(subscribers.length)} note="ทุกสถานะ"/>
      <Metric icon={<Megaphone size={18}/>} label="Active Subscribers" value={String(activeSubscribers.length)} note="พร้อมรับ Newsletter"/>
      <button type="button" onClick={() => void reload()} disabled={busy === 'reload'} className="flex items-center justify-center gap-2 rounded-2xl border bg-white p-4 text-sm font-black shadow-sm"><RefreshCcw size={16} className={busy === 'reload' ? 'animate-spin' : ''}/>รีเฟรชข้อมูล</button>
    </div>

    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="font-black">Contact Inbox</h2><p className="mt-1 text-xs text-slate-500">ข้อความจากลูกค้า พร้อมปุ่มตอบกลับผ่าน Email</p></div><label className="relative min-w-[240px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 w-full rounded-xl border pl-9 pr-3 text-sm" placeholder="ค้นหาชื่อ อีเมล เบอร์ หรือหัวข้อ"/></label></div>
      <div className="max-h-[640px] overflow-auto"><table className="w-full min-w-[980px] text-sm"><thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-4 py-3">ผู้ติดต่อ</th><th className="px-4 py-3">หัวข้อ</th><th className="px-4 py-3">ข้อความ</th><th className="px-4 py-3">วันที่</th><th className="px-4 py-3"></th></tr></thead><tbody>{filteredContacts.map((row, index) => <tr key={String(row.id || `${row.email}-${index}`)} className="border-t align-top"><td className="px-4 py-3"><strong>{row.name || '—'}</strong><p className="mt-1 text-xs text-slate-500">{row.email || '—'}</p><p className="text-xs text-slate-400">{row.phone || ''}</p></td><td className="px-4 py-3 font-semibold">{row.subject || 'ติดต่อร้านค้า'}</td><td className="max-w-[420px] px-4 py-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">{row.message || '—'}</td><td className="px-4 py-3 text-xs text-slate-500">{when(row.created_at)}</td><td className="px-4 py-3 text-right"><button type="button" disabled={!row.email} onClick={() => replyTo(row)} className="rounded-lg border px-2.5 py-1.5 text-xs font-black disabled:opacity-40">ตอบอีเมล</button></td></tr>)}{!filteredContacts.length && <tr><td colSpan={5} className="p-10 text-center text-slate-400">ยังไม่มีข้อความติดต่อ</td></tr>}</tbody></table></div>
    </section>

    <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
      <form onSubmit={sendDirect} className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><Send size={17} className="text-emerald-700"/><div><h2 className="font-black">ส่ง Email รายบุคคล</h2><p className="text-xs text-slate-500">ใช้ SMTP ที่ตั้งไว้ใน Settings และเก็บ email log ฝั่ง API</p></div></div>
        <div className="mt-4 space-y-3"><Field label="ถึง"><input required type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} className="input"/></Field><Field label="หัวข้อ"><input required value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="input"/></Field><Field label="ข้อความ"><textarea required rows={8} value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} className="textarea"/></Field><button disabled={busy === 'direct'} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-950 px-4 py-3 text-sm font-black text-white"><Send size={15}/>{busy === 'direct' ? 'กำลังส่ง…' : 'ส่ง Email'}</button></div>
      </form>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><Megaphone size={17} className="text-violet-700"/><div><h2 className="font-black">Newsletter Broadcast</h2><p className="text-xs text-slate-500">ส่งแบบ BCC เป็น batch ไปยังสมาชิก Active</p></div></div>
        <form onSubmit={sendNewsletter} className="mt-4 space-y-3"><Field label="หัวข้อ Newsletter"><input required value={newsletterSubject} onChange={(e) => setNewsletterSubject(e.target.value)} className="input" disabled={!owner}/></Field><Field label="ข้อความ"><textarea required rows={8} value={newsletterMessage} onChange={(e) => setNewsletterMessage(e.target.value)} className="textarea" disabled={!owner}/></Field><button disabled={busy === 'newsletter' || !owner} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white disabled:opacity-40"><Megaphone size={15}/>{busy === 'newsletter' ? 'กำลังส่ง…' : `ส่งถึงสมาชิก Active ${activeSubscribers.length.toLocaleString('th-TH')} ราย`}</button>{!owner && <p className="text-xs text-amber-700">Manager/Admin ดูรายชื่อได้ แต่การ broadcast ทั้งระบบสงวนสิทธิ์เฉพาะ Super Admin</p>}</form>
        <div className="mt-5 max-h-[280px] overflow-auto rounded-xl border"><table className="w-full min-w-[520px] text-xs"><thead className="sticky top-0 bg-slate-50 text-left text-slate-500"><tr><th className="px-3 py-2">Email</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">สมัครเมื่อ</th></tr></thead><tbody>{subscribers.map((row, index) => <tr key={String(row.id || row.email || index)} className="border-t"><td className="px-3 py-2 font-semibold">{row.email || '—'}</td><td className="px-3 py-2">{row.status || 'active'}</td><td className="px-3 py-2 text-slate-500">{when(row.created_at)}</td></tr>)}{!subscribers.length && <tr><td colSpan={3} className="p-8 text-center text-slate-400">ยังไม่มีสมาชิก Newsletter</td></tr>}</tbody></table></div>
      </section>
    </div>

    <style jsx>{`.input{margin-top:.25rem;height:2.75rem;width:100%;border-radius:.75rem;border:1px solid rgb(226 232 240);padding:0 .75rem;font-size:.875rem}.textarea{margin-top:.25rem;width:100%;border-radius:.75rem;border:1px solid rgb(226 232 240);padding:.75rem;font-size:.875rem}`}</style>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-bold text-slate-600">{label}{children}</label>;
}

function Metric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <article className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-bold text-slate-500">{label}</p><span className="text-emerald-700">{icon}</span></div><strong className="mt-2 block text-xl font-black">{value}</strong><p className="mt-1 text-[10px] text-slate-400">{note}</p></article>;
}
