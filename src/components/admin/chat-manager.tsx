'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { legacyRequest } from '@/lib/legacy-api.client';

type ChatMessage = {
  id: string;
  seq?: number;
  role: 'customer' | 'admin';
  text: string;
  created_at: string;
  sender?: string;
  delivery?: string;
};
type ChatSummary = {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message?: ChatMessage | null;
};
type ChatThread = { id: string; status: string; messages: ChatMessage[] };

function formatTime(value: string) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return value;
  }
}

export function ChatManager({
  initialConversations,
  csrf,
  owner,
}: {
  initialConversations: ChatSummary[];
  csrf: string;
  owner: boolean;
}) {
  const [conversations, setConversations] = useState(initialConversations || []);
  const [selected, setSelected] = useState<ChatThread | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  const selectConversation = useCallback(async (id: string) => {
    try {
      const result = await legacyRequest<any>('telegram.chat.admin.get', { conversation_id: id });
      if (!result?.conversation) throw new Error(result?.error || 'not_found');
      setSelected(result.conversation);
    } catch (error) {
      setNotice({ kind: 'bad', text: error instanceof Error ? error.message : 'เปิดบทสนทนาไม่สำเร็จ' });
    }
  }, []);

  const loadConversations = useCallback(
    async (keepSelection = true) => {
      setLoading(true);
      try {
        const result = await legacyRequest<any>('telegram.chat.admin.list');
        const next: ChatSummary[] = result?.conversations || [];
        setConversations(next);
        const wanted = keepSelection ? selected?.id : undefined;
        const id = wanted && next.some((row) => row.id === wanted) ? wanted : next[0]?.id;
        if (id) await selectConversation(id);
        else setSelected(null);
      } catch (error) {
        setNotice({ kind: 'bad', text: error instanceof Error ? error.message : 'โหลดรายการแชทไม่สำเร็จ' });
      } finally {
        setLoading(false);
      }
    },
    [selected?.id, selectConversation],
  );

  useEffect(() => {
    if (!selected && conversations[0]?.id) void selectConversation(conversations[0].id);
  }, [conversations, selected, selectConversation]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !sending && !deleting) void loadConversations(true);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [deleting, loadConversations, sending]);

  async function setupWebhook() {
    setNotice(null);
    try {
      await legacyRequest('telegram.chat.setup', { csrf }, 'POST');
      setNotice({ kind: 'ok', text: 'เชื่อม Telegram webhook แล้ว' });
    } catch (error) {
      setNotice({ kind: 'bad', text: error instanceof Error ? error.message : 'ตั้งค่า webhook ไม่สำเร็จ' });
    }
  }

  async function sendReply() {
    const message = draft.trim();
    if (!message || !selected || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const result = await legacyRequest<any>(
        'telegram.chat.admin.reply',
        { conversation_id: selected.id, message, csrf },
        'POST',
      );
      if (result?.message)
        setSelected((current) =>
          current ? { ...current, messages: [...current.messages, result.message] } : current,
        );
      setDraft('');
      setNotice({ kind: 'ok', text: 'ส่งข้อความแล้ว' });
      await loadConversations(true);
    } catch (error) {
      setNotice({ kind: 'bad', text: error instanceof Error ? error.message : 'ส่งข้อความไม่สำเร็จ' });
    } finally {
      setSending(false);
    }
  }

  async function closeConversation() {
    if (!selected) return;
    try {
      await legacyRequest('telegram.chat.close', { conversation_id: selected.id, csrf }, 'POST');
      setSelected({ ...selected, status: 'closed' });
      setNotice({ kind: 'ok', text: 'ปิดห้องแล้ว' });
      await loadConversations(true);
    } catch (error) {
      setNotice({ kind: 'bad', text: error instanceof Error ? error.message : 'ปิดบทสนทนาไม่สำเร็จ' });
    }
  }

  function toggleMarked(id: string) {
    setMarked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteMarked() {
    const ids = [...marked];
    if (!ids.length || deleting || !window.confirm(`ลบ ${ids.length} ห้องนี้ถาวร? ข้อความทั้งหมดจะกู้คืนไม่ได้`)) return;
    setDeleting(true);
    setNotice(null);
    try {
      const result = await legacyRequest<any>(
        'telegram.chat.admin.delete',
        { conversation_ids: ids, csrf },
        'POST',
      );
      setMarked(new Set());
      if (selected && ids.includes(selected.id)) setSelected(null);
      setNotice({ kind: 'ok', text: `ลบแล้ว ${result?.deleted ?? ids.length} ห้อง` });
      await loadConversations(false);
    } catch (error) {
      setNotice({ kind: 'bad', text: error instanceof Error ? error.message : 'ลบห้องไม่สำเร็จ' });
    } finally {
      setDeleting(false);
    }
  }

  const title = useMemo(() => (selected ? `ห้อง ${selected.id.slice(0, 8)}` : 'เลือกบทสนทนา'), [selected]);

  return (
    <div className="grid gap-5">
      <section className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-emerald-950 to-emerald-700 p-5 text-white lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-bold">Telegram Live Chat</h2>
          <p className="mt-1 text-sm text-white/70">
            อ่านข้อความจากหน้าร้าน ตอบกลับผ่าน Telegram และ auto-refresh ทุก 15 วินาที
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => loadConversations(true)}
            className="rounded-xl border border-white/30 px-4 py-2 text-sm font-bold"
          >
            {loading ? 'กำลังโหลด…' : 'รีเฟรช'}
          </button>
          <button
            onClick={setupWebhook}
            className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-emerald-950"
          >
            เชื่อม Telegram
          </button>
        </div>
      </section>
      {notice && (
        <p
          className={`rounded-2xl border p-4 text-sm font-semibold ${notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}
        >
          {notice.text}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(260px,.75fr)_minmax(0,1.4fr)]">
        <aside className="max-h-[680px] overflow-auto rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <strong>บทสนทนา</strong>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
              {conversations.length}
            </span>
          </div>
          {owner && marked.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <span>เลือก {marked.size} ห้อง</span>
              <button
                onClick={deleteMarked}
                disabled={deleting}
                className="rounded-lg bg-red-700 px-2 py-1 font-bold text-white"
              >
                {deleting ? 'กำลังลบ…' : 'ลบถาวร'}
              </button>
              <button
                onClick={() => setMarked(new Set())}
                className="rounded-lg border border-red-300 px-2 py-1 font-bold"
              >
                ยกเลิก
              </button>
            </div>
          )}
          <div className="grid gap-2">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => selectConversation(conversation.id)}
                className={`grid grid-cols-[auto_1fr] items-center gap-x-2 rounded-xl border p-3 text-left transition ${selected?.id === conversation.id ? 'border-emerald-500 bg-emerald-50' : marked.has(conversation.id) ? 'border-red-300 bg-red-50' : 'hover:bg-slate-50'}`}
              >
                {owner ? (
                  <input
                    type="checkbox"
                    checked={marked.has(conversation.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleMarked(conversation.id)}
                    aria-label={`เลือกห้อง ${conversation.id.slice(0, 8)}`}
                    className="row-span-3"
                  />
                ) : (
                  <span className="row-span-3 h-2 w-2 rounded-full bg-emerald-500" />
                )}
                <span className="text-[11px] text-slate-500">
                  {conversation.last_message?.role === 'admin' ? 'ทีมงาน' : 'ลูกค้า'} · {conversation.status}
                </span>
                <strong className="truncate text-sm">
                  {conversation.last_message?.text || 'ยังไม่มีข้อความ'}
                </strong>
                <small className="text-[11px] text-slate-500">
                  {formatTime(conversation.updated_at)} · {conversation.message_count} ข้อความ
                </small>
              </button>
            ))}
          </div>
          {!conversations.length && (
            <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">ยังไม่มีบทสนทนา</p>
          )}
        </aside>
        <article className="min-h-[520px] rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b pb-3">
            <div>
              <strong>{title}</strong>
              {selected && (
                <small className="mt-1 block text-xs text-slate-500">
                  {selected.status === 'open' ? 'กำลังเปิด' : 'ปิดแล้ว'}
                </small>
              )}
            </div>
            {selected?.status === 'open' && (
              <button onClick={closeConversation} className="rounded-xl border px-3 py-1.5 text-xs font-bold">
                ปิดห้อง
              </button>
            )}
          </div>
          {selected ? (
            <>
              <div className="flex min-h-[330px] max-h-[500px] flex-col gap-3 overflow-auto py-4">
                {(selected.messages || []).map((item) => (
                  <div
                    key={item.id}
                    className={`max-w-[82%] ${item.role === 'admin' ? 'self-end text-right' : 'self-start'}`}
                  >
                    <small className="text-[10px] text-slate-400">
                      {item.role === 'admin' ? item.sender || 'ทีมงาน' : 'ลูกค้า'} ·{' '}
                      {formatTime(item.created_at)}
                    </small>
                    <p
                      className={`mt-1 whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${item.role === 'admin' ? 'rounded-br-sm bg-emerald-100' : 'rounded-bl-sm bg-slate-100'}`}
                    >
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
              {selected.status === 'open' && (
                <div className="grid gap-2 border-t pt-3 md:grid-cols-[1fr_auto]">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="ตอบลูกค้า…"
                    className="rounded-xl border p-3 text-sm"
                  />
                  <button
                    onClick={sendReply}
                    disabled={sending || !draft.trim()}
                    className="rounded-xl bg-emerald-950 px-5 py-2 font-bold text-white disabled:opacity-50"
                  >
                    {sending ? 'กำลังส่ง…' : 'ส่งข้อความ'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="grid min-h-[430px] place-content-center text-center text-slate-500">
              <strong className="text-lg text-slate-800">เลือกบทสนทนา</strong>
              <p className="mt-1 text-sm">เมื่อมีลูกค้าทักเข้ามา รายการจะแสดงด้านซ้าย</p>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
