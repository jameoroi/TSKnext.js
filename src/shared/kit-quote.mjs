import crypto from 'node:crypto';

const VERSION = 1;
const MAX_TOKEN_AGE_SECONDS = 20 * 60;

function secret() {
  return String(
    process.env.KIT_QUOTE_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    '',
  ).trim();
}

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function decode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signature(body, key) {
  return crypto.createHmac('sha256', key).update(body).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function cleanClaimItem(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || '').trim();
  const variantId = String(value.variant_id || value.variantId || '').trim();
  const rawQty = Math.trunc(Number(value.qty) || 0);
  if (!id || rawQty <= 0) return null;
  const qty = Math.min(999, rawQty);
  return { id, variant_id: variantId, qty };
}

export function kitQuoteSigningConfigured() {
  return Boolean(secret());
}

/**
 * @param {{ tenant?: string, set_id?: string, set_name?: string, discount_amount?: number, eligible_subtotal?: number, items?: Array<{ id: string, variant_id?: string, qty: number }> }} [payload]
 * @param {number} [ttlSeconds]
 */
export function signKitQuote(payload, ttlSeconds = 10 * 60) {
  const key = secret();
  if (!key) throw new Error('kit_quote_signing_not_configured');
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(60, Math.min(MAX_TOKEN_AGE_SECONDS, Math.trunc(Number(ttlSeconds) || 600)));
  const claims = Array.isArray(payload?.items) ? payload.items.map(cleanClaimItem).filter(Boolean) : [];
  const body = encode(JSON.stringify({
    v: VERSION,
    tenant: String(payload?.tenant || '').trim(),
    set_id: String(payload?.set_id || '').trim(),
    set_name: String(payload?.set_name || '').slice(0, 240),
    discount_amount: Math.max(0, Number(payload?.discount_amount || 0)),
    eligible_subtotal: Math.max(0, Number(payload?.eligible_subtotal || 0)),
    items: claims,
    iat: now,
    exp: now + ttl,
  }));
  return `${body}.${signature(body, key)}`;
}

/**
 * @param {string} token
 * @param {{ tenantId?: string, items?: Array<{ id: string, variant_id?: string, qty: number }> }} [options]
 */
export function verifyKitQuote(token, { tenantId = '', items = [] } = {}) {
  const key = secret();
  if (!key) return { ok: false, error: 'kit_quote_signing_not_configured' };
  const raw = String(token || '').trim();
  if (!raw || raw.length > 12_000) return { ok: false, error: 'kit_quote_missing' };
  const [body, mac, extra] = raw.split('.');
  if (!body || !mac || extra !== undefined) return { ok: false, error: 'kit_quote_malformed' };
  if (!safeEqual(mac, signature(body, key))) return { ok: false, error: 'kit_quote_signature' };

  let payload;
  try { payload = JSON.parse(decode(body)); }
  catch { return { ok: false, error: 'kit_quote_payload' }; }

  const now = Math.floor(Date.now() / 1000);
  if (Number(payload?.v) !== VERSION) return { ok: false, error: 'kit_quote_version' };
  if (!payload?.exp || Number(payload.exp) < now) return { ok: false, error: 'kit_quote_expired' };
  if (!payload?.iat || Number(payload.iat) > now + 30 || now - Number(payload.iat) > MAX_TOKEN_AGE_SECONDS + 30) return { ok: false, error: 'kit_quote_time' };
  if (String(payload?.tenant || '') !== String(tenantId || '')) return { ok: false, error: 'kit_quote_tenant' };
  if (!payload?.set_id) return { ok: false, error: 'kit_quote_set' };

  const cart = Array.isArray(items) ? items.map(cleanClaimItem).filter(Boolean) : [];
  const claims = Array.isArray(payload?.items) ? payload.items.map(cleanClaimItem).filter(Boolean) : [];
  for (const claim of claims) {
    const matchingQty = cart
      .filter((line) => line.id === claim.id && (!claim.variant_id || line.variant_id === claim.variant_id))
      .reduce((sum, line) => sum + line.qty, 0);
    if (matchingQty < claim.qty) return { ok: false, error: 'kit_quote_cart_changed' };
  }

  const discountAmount = Math.max(0, Number(payload.discount_amount || 0));
  const eligibleSubtotal = Math.max(0, Number(payload.eligible_subtotal || 0));
  if (!Number.isFinite(discountAmount) || !Number.isFinite(eligibleSubtotal) || discountAmount > eligibleSubtotal + 0.01) {
    return { ok: false, error: 'kit_quote_amount' };
  }

  return { ok: true, payload: { ...payload, discount_amount: discountAmount, eligible_subtotal: eligibleSubtotal, items: claims } };
}
