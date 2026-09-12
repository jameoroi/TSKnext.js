import { persistentStore } from './lib/storage.js';
import { resolveTenant, tenantNamespaces } from './lib/tenants.js';
import crypto from 'node:crypto';

// Each merchant points Meta at its own domain, so the shop this delivery
// belongs to is the one that owns the host it arrived on. The namespace used
// to be fixed, which filed every merchant's customer messages into the first
// merchant's inbox — and verified their webhook against its verify token.
const dataStore = (tenant) => persistentStore(tenantNamespaces(tenant).data);
async function getJSON(store,key){ try{return await store.get(key,{type:'json',consistency:'strong'});}catch{return null;} }
async function getBusinessSettings(tenant){
  const saved = await getJSON(dataStore(tenant),'business-settings')||{};
  const facebook={ page_id:'', page_username:'', page_access_token:'', verify_token:'', ...(saved.facebook||{}) }; if(process.env.FB_PAGE_ACCESS_TOKEN)facebook.page_access_token=process.env.FB_PAGE_ACCESS_TOKEN; if(process.env.FACEBOOK_VERIFY_TOKEN)facebook.verify_token=process.env.FACEBOOK_VERIFY_TOKEN; return {facebook};
}

// One-time setup only (done once in Meta's own developer console, not in this codebase):
//   Webhook URL   = https://YOUR-DOMAIN/api/facebook-webhook
//   Verify token  = whatever you set as facebook.verify_token in Admin > Settings (Super Admin)
// After that, every message a customer sends to your Page arrives here automatically and
// shows up in the Admin > Facebook inbox — no code changes needed ever again.
export default async (req) => {
  const url = new URL(req.url);
  const tenant = resolveTenant(url.hostname);
  if (!tenant) return new Response('unknown_tenant_host', { status: 404 });

  if (req.method === 'GET') {
    const settings = await getBusinessSettings(tenant);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token && settings.facebook.verify_token && token === settings.facebook.verify_token) {
      return new Response(challenge || '', { status: 200 });
    }
    return new Response('verification_failed', { status: 403 });
  }

  if (req.method === 'POST') {
    const raw = await req.text();
    const appSecret=(process.env.FACEBOOK_APP_SECRET||'').trim();
    // Fail closed. The signature check used to be skipped entirely when the
    // secret was unset — which is the shipped default — so anyone who found
    // this URL could write whatever they liked into the admin inbox, posing as
    // a customer. The Telegram webhook has always refused without its secret;
    // this one now matches it. An unconfigured integration is off, not open.
    if(!appSecret) return new Response('webhook_not_configured',{status:503});
    {
      const sig=req.headers.get('x-hub-signature-256')||'';
      const expected='sha256='+crypto.createHmac('sha256',appSecret).update(raw).digest('hex');
      const a=Buffer.from(sig), b=Buffer.from(expected);
      if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return new Response('invalid_signature',{status:403});
    }
    let payload = {};
    try { payload = JSON.parse(raw||'{}'); } catch { payload = {}; }
    const ds = dataStore(tenant);
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    for (const entry of entries) {
      const events = Array.isArray(entry.messaging) ? entry.messaging : [];
      for (const ev of events) {
        const psid = ev.sender?.id;
        if (!psid) continue;
        const text = ev.message?.text || (ev.message?.attachments ? '[ไฟล์แนบ/รูปภาพ]' : '');
        if (!text) continue;
        const key = `fb-conversation:${psid}`;
        const convo = await getJSON(ds, key) || { psid, name: psid, messages: [], unread: 0 };
        // Capped the way the live-chat rooms are (TSK_CHAT_MAX_MESSAGES): a
        // long-running conversation is one `app_kv` row, and an unbounded array
        // makes it grow until the inbox can no longer be read.
        convo.messages = [...(Array.isArray(convo.messages) ? convo.messages : []),
          { from: 'customer', text, at: new Date().toISOString() }].slice(-200);
        convo.unread = (convo.unread || 0) + 1;
        await ds.setJSON(key, convo);
        const idx = await getJSON(ds, 'fb-conversation-index') || [];
        if (!idx.includes(psid)) { idx.push(psid); await ds.setJSON('fb-conversation-index', idx); }
      }
    }
    // Always 200 quickly so Meta doesn't retry/disable the webhook.
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  return new Response('method_not_allowed', { status: 405 });
};
