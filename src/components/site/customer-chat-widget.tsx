'use client';

import {
  Bot,
  ChevronLeft,
  Copy,
  ExternalLink,
  Facebook,
  LoaderCircle,
  MessageCircle,
  Phone,
  Send,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onConsentChange, readConsent } from '@/features/privacy/consent';
import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';
import { publicEnv } from '@/lib/public-env';

type ChatMessage = {
  id: string;
  seq?: number;
  role: 'customer' | 'admin';
  text: string;
  created_at: string;
  sender?: string;
  delivery?: string;
};

type AiProduct = {
  id?: string;
  slug?: string;
  name?: string;
  brand?: string;
  price?: number;
  img?: string;
  image?: string;
};
type AiMessage = { id: string; role: 'user' | 'ai'; text: string; products?: AiProduct[] };
type Mode = 'menu' | 'staff' | 'ai';

const TOKEN_KEY = 'tsk_telegram_chat_token';
const ROOM_KEY = 'tsk_telegram_chat_room';
const AI_STORAGE_KEY = 'tsk-ai-conversation-v2';
const AI_SESSION_KEY = 'tsk-ai-session-id';
const AI_MAX_HISTORY = 12;
const AI_MAX_MESSAGE_LENGTH = 4000;
const DEFAULT_AVATAR = '/legacy-assets/chat-staff.webp';

function createAiSessionId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `tsk-${Date.now().toString(36)}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** True only when the link's host is Facebook or Messenger, not merely mentions it. */
function isFacebookHref(href: string) {
  try {
    const host = new URL(href).hostname.toLowerCase();
    return host === 'm.me' || host === 'facebook.com' || host.endsWith('.facebook.com');
  } catch {
    return false;
  }
}

function getAiSessionId() {
  if (typeof window === 'undefined') return '';
  try {
    const existing = localStorage.getItem(AI_SESSION_KEY);
    if (existing) return existing;
    const id = createAiSessionId();
    localStorage.setItem(AI_SESSION_KEY, id);
    return id;
  } catch {
    return createAiSessionId();
  }
}

function readLegacyAiMessages(): AiMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(AI_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.text === 'string' && (item.type === 'ai' || item.type === 'user'))
      .slice(-AI_MAX_HISTORY)
      .map((item) => ({
        id: String(item.id || `${item.type}-${item.timestamp || Date.now()}`),
        role: item.type as 'ai' | 'user',
        text: String(item.text),
      }));
  } catch {
    return [];
  }
}

function persistLegacyAiMessages(messages: AiMessage[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      AI_STORAGE_KEY,
      JSON.stringify(
        messages
          .slice(-AI_MAX_HISTORY)
          .map((item) => ({ id: item.id, type: item.role, text: item.text, timestamp: Date.now() })),
      ),
    );
  } catch {}
}

function cursorFrom(items: ChatMessage[]) {
  return items.reduce((top, item) => Math.max(top, Number(item.seq || 0)), 0);
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) if (item?.id) map.set(item.id, item);
  return Array.from(map.values())
    .sort((left, right) => {
      const a = Date.parse(left.created_at || '') || 0;
      const b = Date.parse(right.created_at || '') || 0;
      return a !== b ? a - b : Number(left.seq || 0) - Number(right.seq || 0);
    })
    .slice(-100);
}

function publicSetting(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function CustomerChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('menu');
  const [available, setAvailable] = useState(false);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [room, setRoom] = useState('');
  const [token, setToken] = useState('');
  const [cursor, setCursor] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [staffDraft, setStaffDraft] = useState('');
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [roomClosed, setRoomClosed] = useState(false);
  const [aiDraft, setAiDraft] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiHandoff, setAiHandoff] = useState('');
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiSessionId, setAiSessionId] = useState('');
  const [artFailed, setArtFailed] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef(room);
  const tokenRef = useRef(token);
  const cursorRef = useRef(cursor);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  const syncIdentity = useCallback((nextRoom: string, nextToken: string) => {
    if (nextRoom) {
      setRoom(nextRoom);
      roomRef.current = nextRoom;
    }
    if (nextToken) {
      setToken(nextToken);
      tokenRef.current = nextToken;
    }
    try {
      if (nextRoom) localStorage.setItem(ROOM_KEY, nextRoom);
      if (nextToken) localStorage.setItem(TOKEN_KEY, nextToken);
    } catch {}
  }, []);

  const checkAvailability = useCallback(async () => {
    try {
      const result = await legacyRequest<{ ok: boolean; telegram?: boolean }>('chat.availability');
      setAvailable(Boolean(result.telegram));
    } catch {
      setAvailable(false);
    }
  }, []);

  const adoptAccountRoom = useCallback(async () => {
    try {
      const result = await legacyRequest<{ active_conversation_id?: string }>('telegram.chat.mine');
      const active = String(result.active_conversation_id || '');
      if (active && active !== roomRef.current) {
        setMessages([]);
        setCursor(0);
        cursorRef.current = 0;
        syncIdentity(active, tokenRef.current);
      }
    } catch (cause) {
      if (!(cause instanceof LegacyApiError) || cause.status !== 401) {
        // A missing account room is non-fatal; the browser room keeps working.
      }
    }
  }, [syncIdentity]);

  useEffect(() => {
    try {
      setRoom(localStorage.getItem(ROOM_KEY) || '');
      setToken(localStorage.getItem(TOKEN_KEY) || '');
      setAiMessages(readLegacyAiMessages());
      setAiSessionId(getAiSessionId());
    } catch {}
    void Promise.all([checkAvailability(), adoptAccountRoom()]);
    fetch('/api?action=site.settings&compact=1', {
      credentials: 'include',
      headers: { accept: 'application/json' },
    })
      .then((response) => response.json())
      .then((data) => setSettings((data?.settings || {}) as Record<string, unknown>))
      .catch(() => {});
  }, [adoptAccountRoom, checkAvailability]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    const onAiSearch = (event: Event) => {
      const value = String((event as CustomEvent<{ query?: string }>).detail?.query || '')
        .trim()
        .slice(0, 200);
      if (!value) return;
      setOpen(true);
      setMode('ai');
      setAiDraft(value);
      // Match the legacy search affordance: pressing "ถาม AI" is the send
      // action, not merely a prefill that asks the shopper to press again.
      window.setTimeout(() => {
        const textarea = document.querySelector<HTMLTextAreaElement>('[data-ai-chat-composer]');
        textarea?.focus();
        document.querySelector<HTMLButtonElement>('[data-ai-chat-submit]')?.click();
      }, 0);
    };
    window.addEventListener('tsk-ai-search', onAiSearch);
    return () => window.removeEventListener('tsk-ai-search', onAiSearch);
  }, []);

  useEffect(() => {
    // Timing deps: re-scroll whenever the conversation grows or the panel changes.
    void messages.length;
    void aiMessages.length;
    void aiBusy;
    void mode;
    void open;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, aiMessages, aiBusy, mode, open]);

  useEffect(() => {
    if (!aiSessionId) return;
    persistLegacyAiMessages(aiMessages);
  }, [aiMessages, aiSessionId]);

  const poll = useCallback(async () => {
    const id = roomRef.current;
    const visitor = tokenRef.current;
    if (!id || !visitor) return;
    try {
      const result = await legacyRequest<{ messages?: ChatMessage[]; cursor?: number; status?: string }>(
        'telegram.chat.get',
        {
          conversation_id: id,
          visitor_token: visitor,
          after: cursorRef.current,
        },
      );
      const incoming = Array.isArray(result.messages) ? result.messages : [];
      if (incoming.length) setMessages((current) => mergeMessages(current, incoming));
      const nextCursor = Math.max(Number(result.cursor || 0), cursorFrom(incoming));
      setCursor(nextCursor);
      cursorRef.current = nextCursor;
      setStaffError('');
      setRoomClosed(Boolean(result.status && result.status !== 'open'));
    } catch (cause) {
      if (cause instanceof LegacyApiError && cause.code === 'conversation_forbidden') {
        setRoom('');
        roomRef.current = '';
        setCursor(0);
        cursorRef.current = 0;
        setRoomClosed(true);
        try {
          localStorage.removeItem(ROOM_KEY);
        } catch {}
      } else {
        setStaffError('เชื่อมต่อแชทไม่สำเร็จ กรุณาลองใหม่');
      }
    }
  }, []);

  useEffect(() => {
    if (!open || mode !== 'staff' || !room || !token || roomClosed) return;
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => window.clearInterval(timer);
  }, [mode, open, poll, room, roomClosed, token]);

  const sendStaffMessage = useCallback(
    async (raw: string) => {
      const message = raw.trim();
      if (!message || staffBusy) return;
      setStaffBusy(true);
      setStaffError('');
      try {
        const result = await legacyRequest<{
          visitor_token?: string;
          conversation_id?: string;
          messages?: ChatMessage[];
        }>(
          'telegram.chat.send',
          {
            message,
            page: pathname,
            visitor_token: tokenRef.current,
            conversation_id: roomRef.current,
          },
          'POST',
        );
        const nextRoom = String(result.conversation_id || roomRef.current || '');
        const nextToken = String(result.visitor_token || tokenRef.current || '');
        syncIdentity(nextRoom, nextToken);
        setRoomClosed(false);
        const incoming = Array.isArray(result.messages) ? result.messages : [];
        setMessages((current) => mergeMessages(current, incoming));
        const nextCursor = Math.max(cursorRef.current, cursorFrom(incoming));
        setCursor(nextCursor);
        cursorRef.current = nextCursor;
        setStaffDraft('');
      } catch (cause) {
        const code = cause instanceof LegacyApiError ? cause.code : '';
        setStaffError(
          code === 'telegram_not_configured'
            ? 'แชททีมงานยังไม่เปิดใช้งาน'
            : code === 'rate_limited'
              ? 'ส่งข้อความถี่เกินไป กรุณารอสักครู่'
              : 'ส่งข้อความไม่สำเร็จ กรุณาลองใหม่',
        );
      } finally {
        setStaffBusy(false);
      }
    },
    [pathname, staffBusy, syncIdentity],
  );

  async function sendAi() {
    const message = aiDraft.trim();
    if (!message || aiBusy) return;
    setAiBusy(true);
    setAiError('');
    setAiHandoff('');
    const userMessage: AiMessage = { id: `u-${Date.now()}`, role: 'user', text: message };
    const history = [...aiMessages, userMessage];
    setAiMessages(history);
    setAiDraft('');
    try {
      const result = await legacyRequest<{ reply?: string; products?: AiProduct[] }>(
        'ai.n8n',
        {
          message,
          page: pathname,
          history: history.slice(-AI_MAX_HISTORY),
          session_id: aiSessionId || getAiSessionId(),
        },
        'POST',
      );
      const reply = String(result.reply || '').trim();
      if (!reply) throw new Error('ai_empty_response');
      setAiMessages((current) => [
        ...current,
        { id: `a-${Date.now()}`, role: 'ai', text: reply, products: result.products || [] },
      ]);
    } catch (cause) {
      const code = cause instanceof LegacyApiError ? cause.code : cause instanceof Error ? cause.message : '';
      setAiError(
        code === 'ai_not_configured'
          ? 'ผู้ช่วย AI ยังไม่เปิดใช้งาน'
          : code === 'ai_empty_response'
            ? 'ผู้ช่วย AI ตอบกลับไม่สมบูรณ์'
            : 'AI ตอบไม่ได้ชั่วคราว',
      );
      setAiHandoff(message);
    } finally {
      setAiBusy(false);
    }
  }

  function clearAiConversation() {
    if (aiBusy) return;
    if (!window.confirm('ต้องการล้างประวัติการสนทนากับ AI หรือไม่?')) return;
    setAiMessages([]);
    setAiError('');
    setAiHandoff('');
    try {
      localStorage.removeItem(AI_STORAGE_KEY);
    } catch {}
    showChatStatus('เริ่มบทสนทนาใหม่แล้ว');
  }

  async function copyAiResponse(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showChatStatus('คัดลอกคำตอบ AI แล้ว');
    } catch {
      showChatStatus('คัดลอกไม่สำเร็จ');
    }
  }

  function retryAi() {
    const question = aiHandoff.trim();
    if (!question || aiBusy) return;
    setAiDraft(question);
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('[data-ai-chat-submit]')?.click(), 0);
  }

  function showChatStatus(message: string) {
    setAiError(message);
    window.setTimeout(() => setAiError((current) => (current === message ? '' : current)), 1800);
  }

  async function handoff() {
    const question = aiHandoff.trim();
    if (!question) return;
    setMode('staff');
    setAiHandoff('');
    setAiError('');
    await sendStaffMessage(question);
  }

  // Preserve the old Facebook Customer Chat integration, but only after the
  // visitor consents to marketing/social embeds. The first-party launcher and
  // Telegram/AI chat remain available without that consent.
  useEffect(() => {
    const pageId = publicEnv('NEXT_PUBLIC_FB_PAGE_ID') || undefined;
    if (!pageId) return;
    let loaded = false;
    const mount = (consent = readConsent()) => {
      const allowed = Boolean(consent?.marketing);
      setMarketingConsent(allowed);
      if (loaded || !allowed || document.getElementById('facebook-jssdk')) return;
      loaded = true;
      (
        window as Window & {
          fbAsyncInit?: () => void;
          FB?: { init: (config: Record<string, unknown>) => void };
        }
      ).fbAsyncInit = () => {
        try {
          (window as Window & { FB?: { init: (config: Record<string, unknown>) => void } }).FB?.init({
            xfbml: true,
            version: 'v21.0',
          });
        } catch {}
      };
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.src = 'https://connect.facebook.net/th_TH/sdk/xfbml.customerchat.js';
      document.body.appendChild(script);
    };
    mount();
    return onConsentChange((consent) => mount(consent));
  }, []);

  const lineUrl =
    publicSetting(settings.line_oa_url) || publicEnv('NEXT_PUBLIC_LINE_OA_URL') || undefined || '';
  const phone =
    publicSetting(settings.contact_phone) ||
    publicEnv('NEXT_PUBLIC_CONTACT_PHONE') ||
    undefined ||
    '088-2608042';
  const pageUsername =
    publicSetting(settings.fb_page_username) || publicEnv('NEXT_PUBLIC_FB_PAGE_USERNAME') || undefined || '';
  const avatar =
    publicSetting(settings.chat_avatar_data_url) || publicSetting(settings.chat_avatar_url) || DEFAULT_AVATAR;
  const channels = useMemo(
    () =>
      [
        pageUsername
          ? { label: 'Facebook เพจร้าน', href: `https://facebook.com/${pageUsername}`, external: true }
          : null,
        pageUsername
          ? { label: 'แชทผ่าน Messenger', href: `https://m.me/${pageUsername}`, external: true }
          : null,
        lineUrl ? { label: 'แชทผ่าน LINE OA', href: lineUrl, external: true } : null,
        phone
          ? { label: `โทร ${phone}`, href: `tel:${phone.replace(/[^\d+]/g, '')}`, external: false }
          : null,
      ].filter(Boolean) as Array<{ label: string; href: string; external: boolean }>,
    [lineUrl, pageUsername, phone],
  );

  const hidden = ['/admin', '/agent', '/supplier', '/owner', '/operations'].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (hidden) return null;

  const pageId = publicEnv('NEXT_PUBLIC_FB_PAGE_ID') || undefined || '';
  const themeColor = publicEnv('NEXT_PUBLIC_FB_THEME_COLOR') || undefined || '#0B2E22';

  return (
    <>
      <div id="fb-root" />
      {pageId && marketingConsent ? (
        <div
          className="fb-customerchat"
          data-attribution="biz_inbox"
          data-page_id={pageId}
          data-theme_color={themeColor}
        />
      ) : null}
      <div className="fixed bottom-24 right-4 z-[70] flex flex-col items-end gap-2 md:bottom-6 md:right-6">
        {open ? (
          <section
            className="w-[min(390px,calc(100vw-24px))] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            aria-label="แชทกับ THAISERKIT SUPPLY"
          >
            <header className="flex items-center gap-3 bg-emerald-950 px-4 py-3 text-white">
              {mode !== 'menu' ? (
                <button
                  type="button"
                  onClick={() => setMode('menu')}
                  className="grid size-9 place-items-center rounded-full hover:bg-white/10"
                  aria-label="กลับ"
                >
                  <ChevronLeft className="size-5" />
                </button>
              ) : (
                <span className="grid size-9 place-items-center rounded-full bg-white/10">
                  <MessageCircle className="size-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <strong className="block text-sm">
                  {mode === 'staff'
                    ? 'แชทกับทีมงาน'
                    : mode === 'ai'
                      ? 'AI ผู้ช่วยร้านค้า'
                      : 'ติดต่อ THAISERKIT SUPPLY'}
                </strong>
                <span className="block text-xs text-emerald-100/70">
                  {mode === 'staff'
                    ? available
                      ? 'ทีมงานตอบกลับผ่าน Telegram'
                      : 'ทีมงานออฟไลน์'
                    : mode === 'ai'
                      ? 'ถามสินค้าและข้อมูลทั่วไปได้ทันที'
                      : 'เลือกช่องทางที่สะดวก'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-9 place-items-center rounded-full hover:bg-white/10"
                aria-label="ปิดแชท"
              >
                <X className="size-5" />
              </button>
            </header>

            {mode === 'menu' ? (
              <div className="grid gap-2 p-4">
                <button
                  type="button"
                  onClick={() => {
                    setMode('staff');
                    setRoomClosed(false);
                    void adoptAccountRoom();
                  }}
                  className="flex items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-left text-sky-950 transition hover:bg-sky-100"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-sky-500 text-white">
                    <UserRound className="size-5" />
                  </span>
                  <span>
                    <strong className="block text-sm">แชทกับทีมงาน</strong>
                    <small className="text-sky-700">
                      {available ? 'ถามต่อเนื่องได้ ห้องเดิมกลับมาอ่านได้' : 'ทีมงานออฟไลน์ — ฝากข้อความไว้ได้'}
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('ai')}
                  className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-left text-violet-950 transition hover:bg-violet-100"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-violet-600 text-white">
                    <Sparkles className="size-5" />
                  </span>
                  <span>
                    <strong className="block text-sm">ถาม AI ผู้ช่วยร้านค้า</strong>
                    <small className="text-violet-700">ช่วยค้นหาและแนะนำสินค้าเบื้องต้น</small>
                  </span>
                </button>
                {channels.map((channel) => (
                  <a
                    key={channel.href}
                    href={channel.href}
                    target={channel.external ? '_blank' : undefined}
                    rel={channel.external ? 'noopener noreferrer' : undefined}
                    className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2">
                      {channel.href.startsWith('tel:') ? (
                        <Phone className="size-4" />
                      ) : isFacebookHref(channel.href) ? (
                        <Facebook className="size-4" />
                      ) : (
                        <MessageCircle className="size-4" />
                      )}
                      {channel.label}
                    </span>
                    {channel.external ? <ExternalLink className="size-4 text-slate-400" /> : null}
                  </a>
                ))}
                <Link
                  href="/contact"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-semibold hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2">
                    <Send className="size-4" />
                    ส่งข้อความถึงเรา
                  </span>
                </Link>
              </div>
            ) : null}

            {mode === 'staff' ? (
              <div>
                <div
                  ref={scrollRef}
                  className="h-[330px] space-y-3 overflow-y-auto bg-slate-50 p-4"
                  aria-live="polite"
                >
                  {!messages.length ? (
                    <div className="mx-auto max-w-[260px] py-14 text-center text-sm text-slate-500">
                      <UserRound className="mx-auto mb-3 size-9 text-sky-500" />
                      พิมพ์คำถามได้เลย ทีมงานจะตอบกลับในห้องนี้
                    </div>
                  ) : null}
                  {messages.map((item) => (
                    <div
                      key={item.id}
                      className={`flex ${item.role === 'customer' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-6 ${item.role === 'customer' ? 'rounded-br-md bg-emerald-900 text-white' : 'rounded-bl-md border bg-white text-slate-800'}`}
                      >
                        <p className="whitespace-pre-wrap break-words">{item.text}</p>
                        {item.created_at ? (
                          <small
                            className={`mt-1 block text-[10px] ${item.role === 'customer' ? 'text-emerald-100/70' : 'text-slate-400'}`}
                          >
                            {new Date(item.created_at).toLocaleTimeString('th-TH', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </small>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {roomClosed ? (
                    <p className="rounded-xl bg-amber-50 p-3 text-center text-xs text-amber-800">
                      ห้องเดิมหมดเวลาแล้ว ส่งข้อความใหม่เพื่อเริ่มห้องใหม่ได้เลย
                    </p>
                  ) : null}
                  {staffError ? (
                    <p className="rounded-xl bg-rose-50 p-3 text-center text-xs text-rose-700" role="alert">
                      {staffError}
                    </p>
                  ) : null}
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void sendStaffMessage(staffDraft);
                  }}
                  className="flex gap-2 border-t bg-white p-3"
                >
                  <textarea
                    value={staffDraft}
                    onChange={(event) => setStaffDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void sendStaffMessage(staffDraft);
                      }
                    }}
                    rows={1}
                    maxLength={2000}
                    placeholder="พิมพ์ข้อความถึงทีมงาน…"
                    className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                  <button
                    type="submit"
                    disabled={staffBusy || !staffDraft.trim() || !available}
                    className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-900 text-white disabled:opacity-40"
                    aria-label="ส่งข้อความ"
                  >
                    {staffBusy ? (
                      <LoaderCircle className="size-5 animate-spin" />
                    ) : (
                      <Send className="size-5" />
                    )}
                  </button>
                </form>
              </div>
            ) : null}

            {mode === 'ai' ? (
              <div>
                <div className="flex items-center justify-between border-b bg-white px-3 py-2">
                  <span className="text-[11px] font-semibold text-slate-500">ประวัติจะเก็บไว้ในอุปกรณ์นี้</span>
                  {aiMessages.length ? (
                    <button
                      type="button"
                      onClick={clearAiConversation}
                      disabled={aiBusy}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 disabled:opacity-40"
                    >
                      <Trash2 className="size-3.5" />
                      ล้างประวัติ
                    </button>
                  ) : null}
                </div>
                <div
                  ref={scrollRef}
                  className="h-[330px] space-y-3 overflow-y-auto bg-slate-50 p-4"
                  aria-live="polite"
                >
                  {!aiMessages.length ? (
                    <div className="mx-auto max-w-[290px] py-8 text-center text-sm text-slate-500">
                      <Bot className="mx-auto mb-3 size-10 text-violet-600" />
                      <strong className="mb-1 block text-slate-700">ถาม AI ได้เลย</strong>
                      <p>เช่น “มีสว่านสำหรับงานคอนกรีตไหม”</p>
                      <div className="mt-3 flex flex-wrap justify-center gap-2">
                        {['แนะนำเครื่องมือช่าง', 'สินค้าขายดีมีอะไรบ้าง', 'ช่วยเลือกสินค้าให้หน่อย'].map((question) => (
                          <button
                            key={question}
                            type="button"
                            onClick={() => setAiDraft(question)}
                            className="rounded-full border bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50"
                          >
                            {question}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {aiMessages.map((item) => (
                    <div
                      key={item.id}
                      className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[86%] rounded-2xl px-3 py-2 text-sm leading-6 ${item.role === 'user' ? 'rounded-br-md bg-violet-700 text-white' : 'rounded-bl-md border bg-white text-slate-800'}`}
                      >
                        <p className="whitespace-pre-wrap break-words">{item.text}</p>
                        {item.role === 'ai' ? (
                          <button
                            type="button"
                            onClick={() => void copyAiResponse(item.text)}
                            className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-slate-700"
                          >
                            <Copy className="size-3" />
                            คัดลอก
                          </button>
                        ) : null}
                        {item.products?.length ? (
                          <div className="mt-2 grid gap-2">
                            {item.products.slice(0, 4).map((product, index) => (
                              <Link
                                key={String(product.id || product.slug || index)}
                                href={`/products/${encodeURIComponent(String(product.slug || product.id || ''))}`}
                                onClick={() => setOpen(false)}
                                className="flex items-center gap-2 rounded-xl border bg-slate-50 p-2 text-slate-800"
                              >
                                <img
                                  src={String(
                                    product.img || product.image || '/legacy-assets/placeholder-product.svg',
                                  )}
                                  alt=""
                                  className="size-11 rounded-lg object-cover"
                                />
                                <span className="min-w-0">
                                  <strong className="line-clamp-2 block text-xs">
                                    {product.name || 'สินค้าแนะนำ'}
                                  </strong>
                                  <small className="text-[11px] text-slate-500">{product.brand || ''}</small>
                                  {Number(product.price || 0) > 0 ? (
                                    <b className="block text-xs text-emerald-800">
                                      ฿{Number(product.price).toLocaleString('th-TH')}
                                    </b>
                                  ) : null}
                                </span>
                              </Link>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {aiBusy ? (
                    <div className="flex justify-start">
                      <div className="flex gap-1 rounded-2xl border bg-white px-4 py-3">
                        <span className="size-1.5 animate-bounce rounded-full bg-violet-500" />
                        <span className="size-1.5 animate-bounce rounded-full bg-violet-500 [animation-delay:120ms]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-violet-500 [animation-delay:240ms]" />
                      </div>
                    </div>
                  ) : null}
                  {aiError ? (
                    <div
                      className={`rounded-xl p-3 text-xs ${aiError.includes('แล้ว') || aiError.includes('ใหม่') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
                      role="status"
                    >
                      <p>{aiError}</p>
                      {aiHandoff ? (
                        <div className="mt-2 flex gap-3">
                          <button type="button" onClick={retryAi} className="font-bold underline">
                            ลองอีกครั้ง
                          </button>
                          {available ? (
                            <button
                              type="button"
                              onClick={() => void handoff()}
                              className="font-bold underline"
                            >
                              ส่งให้ทีมงานตอบแทน
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void sendAi();
                  }}
                  className="relative flex gap-2 border-t bg-white p-3 pb-7"
                >
                  <textarea
                    value={aiDraft}
                    onChange={(event) => setAiDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void sendAi();
                      }
                    }}
                    rows={1}
                    maxLength={AI_MAX_MESSAGE_LENGTH}
                    data-ai-chat-composer=""
                    placeholder="ถาม AI ได้เลย…"
                    className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-200"
                  />
                  <button
                    type="submit"
                    disabled={aiBusy || !aiDraft.trim()}
                    data-ai-chat-submit=""
                    className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-700 text-white disabled:opacity-40"
                    aria-label="ส่งข้อความถึง AI"
                  >
                    {aiBusy ? <LoaderCircle className="size-5 animate-spin" /> : <Send className="size-5" />}
                  </button>
                  <span className="absolute bottom-1 right-4 text-[9px] text-slate-400">
                    {aiDraft.length}/{AI_MAX_MESSAGE_LENGTH}
                  </span>
                </form>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Launcher = ไฟล์ PNG สติกเกอร์พื้นหลังใสอย่างเดียว — ห้ามครอบกรอบ (no rounded/ring/shadow/bg) */}
        <button
          type="button"
          onClick={() => {
            setOpen((value) => !value);
            if (!open) {
              setMode(available ? 'staff' : 'menu');
              void checkAvailability();
            }
          }}
          className={`relative grid place-items-center transition hover:scale-105 ${open ? 'size-14 rounded-full border-2 border-white bg-emerald-900 text-white shadow-xl' : artFailed ? 'size-16 rounded-full border-[3px] border-white bg-emerald-800 shadow-xl' : 'size-20 bg-transparent'}`}
          aria-expanded={open}
          aria-label={open ? 'ปิดแชท' : 'เปิดแชทกับเรา'}
        >
          {open ? (
            <X className="size-6" />
          ) : artFailed ? (
            <MessageCircle className="size-7" />
          ) : (
            <img
              src={avatar}
              alt="แชทกับเรา"
              width={160}
              height={160}
              className="size-full rounded-none object-contain"
              style={{ background: 'transparent', border: 'none', borderRadius: 0, boxShadow: 'none' }}
              draggable={false}
              onError={() => setArtFailed(true)}
            />
          )}
        </button>
      </div>
    </>
  );
}
