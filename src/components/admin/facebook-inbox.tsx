'use client';

import { Facebook, RefreshCcw, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { legacyRequest } from '@/lib/legacy-api.client';

type Summary = {
  psid: string;
  name?: string;
  unread?: number;
  last_message?: { from?: string; text?: string; at?: string } | null;
};
type Message = { from?: 'customer' | 'page' | string; text?: string; at?: string; by?: string };
type Conversation = { psid?: string; name?: string; unread?: number; messages?: Message[] };

function when(value: unknown) {
  const raw = String(value || '');
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return raw;
  }
}

export function FacebookInbox({ initial, csrf }: { initial: Summary[]; csrf: string }) {
  const [rows, setRows] = useState<Summary[]>(initial || []);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  const currentPsid = String(selected?.psid || '');
  const title = useMemo(() => selected?.name || currentPsid || 'เลือกบทสนทนา', [currentPsid, selected?.name]);

  async function loadList(keep = true) {
    setBusy('list');
    setNotice(null);
    try {
      const answer = await legacyRequest<any>('facebook.conversations.list');
      const next = Array.isArray(answer?.conversations) ? answer.conversations : [];
      setRows(next);
      const id =
        keep && currentPsid && next.some((row: Summary) => row.psid === currentPsid)
          ? currentPsid
          : next[0]?.psid;
      if (id) await open(id);
      else setSelected(null);
    } catch (error) {
      setNotice({
        kind: 'bad',
        text: error instanceof Error ? error.message : 'โหลด Facebook Inbox ไม่สำเร็จ',
      });
    } finally {
      setBusy('');
    }
  }

  async function open(psid: string) {
    if (!psid) return;
    setBusy(`open:${psid}`);
    setNotice(null);
    try {
      const answer = await legacyRequest<any>('facebook.conversation.get', { psid });
      setSelected(answer?.conversation || null);
      setRows((current) => current.map((row) => (row.psid === psid ? { ...row, unread: 0 } : row)));
    } catch (error) {
      setNotice({ kind: 'bad', text: error instanceof Error ? error.message : 'เปิดบทสนทนาไม่สำเร็จ' });
    } finally {
      setBusy('');
    }
  }

  async function send() {
    const text = draft.trim();
    if (!currentPsid || !text || busy === 'send') return;
    setBusy('send');
    setNotice(null);
    try {
      await legacyRequest('facebook.message.send', { psid: currentPsid, text, csrf }, 'POST');
      setDraft('');
      await open(currentPsid);
      setNotice({ kind: 'ok', text: 'ส่งข้อความผ่าน Facebook Messenger แล้ว' });
    } catch (error) {
      setNotice({ kind: 'bad', text: error instanceof Error ? error.message : 'ส่งข้อความไม่สำเร็จ' });
    } finally {
      setBusy('');
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && busy === '') void loadList(true);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [busy, currentPsid]);

  return (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b bg-[#1877F2] p-5 text-white">
        <div className="flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-white/15">
            <Facebook size={22} />
          </span>
          <div>
            <h2 className="text-xl font-black">Facebook Messenger Inbox</h2>
            <p className="mt-1 text-sm text-white/75">
              รับข้อความจาก Meta Webhook · อ่าน thread · ตอบกลับด้วย Page Access Token
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadList(true)}
          disabled={busy === 'list'}
          className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-3 py-2 text-sm font-bold"
        >
          <RefreshCcw size={15} className={busy === 'list' ? 'animate-spin' : ''} />
          รีเฟรช
        </button>
      </header>
      {notice && (
        <p
          className={`m-4 rounded-xl p-3 text-sm font-semibold ${notice.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}
        >
          {notice.text}
        </p>
      )}
      <div className="grid min-h-[480px] lg:grid-cols-[300px_1fr]">
        <aside className="max-h-[620px] overflow-auto border-r p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <strong className="text-sm">บทสนทนา</strong>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">{rows.length}</span>
          </div>
          <div className="grid gap-2">
            {rows.map((row) => (
              <button
                key={row.psid}
                type="button"
                onClick={() => void open(row.psid)}
                className={`rounded-xl border p-3 text-left ${currentPsid === row.psid ? 'border-blue-400 bg-blue-50' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <strong className="truncate text-sm">{row.name || row.psid}</strong>
                  {Number(row.unread || 0) > 0 && (
                    <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-black text-white">
                      {row.unread}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {row.last_message?.text || 'ยังไม่มีข้อความ'}
                </p>
                <small className="mt-1 block text-[10px] text-slate-400">{when(row.last_message?.at)}</small>
              </button>
            ))}
          </div>
          {!rows.length && (
            <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">
              ยังไม่มีข้อความจาก Facebook
            </p>
          )}
        </aside>
        <article className="flex min-w-0 flex-col p-4">
          <div className="border-b pb-3">
            <strong>{title}</strong>
            {currentPsid && <small className="ml-2 text-xs text-slate-400">PSID {currentPsid}</small>}
          </div>
          <div className="flex min-h-[330px] flex-1 flex-col gap-3 overflow-auto py-4">
            {(selected?.messages || []).map((message, index) => {
              const mine = message.from === 'page';
              return (
                <div
                  key={`${message.at || index}:${index}`}
                  className={`max-w-[82%] ${mine ? 'self-end text-right' : 'self-start'}`}
                >
                  <small className="text-[10px] text-slate-400">
                    {mine ? message.by || 'เพจ' : 'ลูกค้า'} · {when(message.at)}
                  </small>
                  <p
                    className={`mt-1 whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${mine ? 'rounded-br-sm bg-blue-100' : 'rounded-bl-sm bg-slate-100'}`}
                  >
                    {message.text || '—'}
                  </p>
                </div>
              );
            })}
            {!selected && (
              <div className="m-auto text-center text-sm text-slate-400">
                <Facebook className="mx-auto mb-2" />
                เลือกบทสนทนาทางซ้าย
              </div>
            )}
          </div>
          {selected && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
              className="grid gap-2 border-t pt-3 md:grid-cols-[1fr_auto]"
            >
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="ตอบลูกค้าผ่าน Messenger…"
                className="rounded-xl border p-3 text-sm"
              />
              <button
                disabled={!draft.trim() || busy === 'send'}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1877F2] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                <Send size={16} />
                {busy === 'send' ? 'กำลังส่ง…' : 'ส่ง'}
              </button>
            </form>
          )}
        </article>
      </div>
    </section>
  );
}
