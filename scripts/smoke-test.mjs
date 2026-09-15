#!/usr/bin/env node
import { randomInt } from 'node:crypto';

/**
 * End-to-end commerce smoke test.
 *
 * Mutating a live shop is intentionally opt-in. CI should point this at a
 * disposable/staging deployment and set SMOKE_ALLOW_MUTATIONS=1. No account
 * password, API key or tenant id is stored in this file.
 */

const baseUrl = String(process.env.SMOKE_BASE_URL || process.env.PRODUCTION_URL || '').replace(/\/$/, '');
const allowMutations = process.env.SMOKE_ALLOW_MUTATIONS === '1';
const adminUsername = String(process.env.SMOKE_ADMIN_USERNAME || '').trim();
const adminPassword = String(process.env.SMOKE_ADMIN_PASSWORD || '');
const turnstileToken = String(process.env.SMOKE_TURNSTILE_TOKEN || '');

if (!baseUrl) throw new Error('SMOKE_BASE_URL or PRODUCTION_URL is required');
if (!allowMutations) {
  throw new Error(
    'Refusing destructive smoke flow: set SMOKE_ALLOW_MUTATIONS=1 against a disposable deployment',
  );
}
if (!adminUsername || !adminPassword) {
  throw new Error('SMOKE_ADMIN_USERNAME and SMOKE_ADMIN_PASSWORD are required');
}

function client(label) {
  const cookies = new Map();
  let csrf = '';

  function saveCookies(response) {
    const values = response.headers.getSetCookie?.() || [];
    for (const value of values) {
      const pair = value.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  async function call(action, payload = {}, method = 'POST') {
    const isGet = method === 'GET';
    const url = new URL(`${baseUrl}/api`);
    url.searchParams.set('action', action);
    if (isGet) {
      for (const [key, value] of Object.entries(payload)) url.searchParams.set(key, String(value));
    }
    const headers = {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (compatible; thaiserkit-smoke-test/1.0)',
      cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
    };
    const body = isGet
      ? undefined
      : JSON.stringify({
          action,
          ...payload,
          ...(turnstileToken ? { 'cf-turnstile-response': turnstileToken } : {}),
        });
    if (body) headers['content-type'] = 'application/json';
    const response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(30_000) });
    saveCookies(response);
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`${label} ${action}: expected JSON, received HTTP ${response.status}`);
    }
    if (!response.ok || data.ok === false) {
      throw new Error(`${label} ${action}: HTTP ${response.status} ${data.error || 'request_failed'}`);
    }
    if (data.csrf) csrf = String(data.csrf);
    return data;
  }

  function withCsrf(payload = {}) {
    if (!csrf) throw new Error(`${label}: CSRF token missing before ${JSON.stringify(payload)}`);
    return { ...payload, csrf };
  }

  return {
    call,
    withCsrf,
    get csrf() {
      return csrf;
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function availableProduct(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const variant = variants.find(
    (item) =>
      item?.state !== 'hidden' &&
      item?.state !== 'discontinued' &&
      (item?.unlimited || Number(item?.stock) > 0),
  );
  if (variant) return { product, variant };
  if (product?.unlimited || Number(product?.stock) > 0 || Number(product?.available) > 0) {
    return {
      product,
      variant: {
        id: '',
        sku: product.sku || '',
        barcode: product.barcode || '',
        price: product.price,
        label: '',
        stock: product.stock,
      },
    };
  }
  return null;
}

const customer = client('customer');
const admin = client('admin');
const unique = `${Date.now()}-${randomInt(10_000)}`;
const email = `smoke-${unique}@example.invalid`;
const phone = `08${String(unique.replace(/\D/g, '')).slice(-8).padStart(8, '0')}`;
const password = `Smoke-${unique}-Pass!`;

console.log(`[smoke] ${baseUrl}`);
const health = await fetch(`${baseUrl}/api/health`, {
  headers: { accept: 'application/json' },
  signal: AbortSignal.timeout(15_000),
});
assert(health.ok, `/api/health returned HTTP ${health.status}`);
const healthBody = await health.json().catch(() => ({}));
assert(
  healthBody.status === 'healthy' || healthBody.ok === true,
  `/api/health is not healthy: ${JSON.stringify(healthBody)}`,
);

const products = await customer.call('products.list', { per_page: 100 }, 'GET');
const selected = (products.products || []).map(availableProduct).find(Boolean);
assert(selected, 'No active product with stock is available for smoke test');
const { product, variant } = selected;
const quantity = 1;
const price = Number(variant.price ?? product.price ?? 0);
assert(price > 0, `Selected product has invalid price: ${product.id}`);
const item = {
  id: product.id,
  variant_id: variant.id,
  sku: variant.sku || product.sku || '',
  barcode: variant.barcode || '',
  name: product.name,
  qty: quantity,
  price,
};

await customer.call('customer.register', {
  name: 'Smoke Test Customer',
  email,
  phone,
  password,
});
await customer.call('customer.wishlist.toggle', customer.withCsrf({ product_id: product.id }));
const wishlist = await customer.call('customer.wishlist.list', {}, 'GET');
assert((wishlist.ids || []).includes(product.id), 'Wishlist did not contain the selected product');
await customer.call('checkout.stock.validate', { items: [item] });

const subtotal = price * quantity;
const total = subtotal > 1500 ? subtotal : subtotal + 80;
const order = await customer.call(
  'order.create',
  customer.withCsrf({
    name: 'Smoke Test Customer',
    email,
    phone,
    address: 'Smoke test address',
    province: 'เชียงใหม่',
    zip: '50000',
    payment_method: 'เก็บเงินปลายทาง (COD)',
    items: [item],
    total,
    terms_accepted: true,
    idempotency_key: `smoke-${unique}`,
  }),
);
assert(order.order_no && order.upload_token, 'Order did not return order number and tracking token');

await admin.call('admin.login', { username: adminUsername, password: adminPassword });
const adminOrders = await admin.call('admin.orders.list', {}, 'GET');
const created = (adminOrders.orders || []).find((entry) => entry.order_no === order.order_no);
assert(created?.id, `Admin could not find smoke order ${order.order_no}`);
await admin.call('admin.order.status', admin.withCsrf({ id: created.id, status: 'paid' }));
await admin.call(
  'admin.order.shipping',
  admin.withCsrf({ id: created.id, carrier: 'smoke-carrier', tracking_number: `SMOKE${unique}` }),
);
await admin.call(
  'admin.order.status',
  admin.withCsrf({
    id: created.id,
    status: 'shipped',
    carrier: 'smoke-carrier',
    tracking_number: `SMOKE${unique}`,
  }),
);

const tracked = await customer.call('order.track', customer.withCsrf({ order_no: order.order_no }));
assert(
  tracked.order?.tracking_number === `SMOKE${unique}`,
  'Customer tracking did not contain the admin-entered tracking number',
);
const review = await customer.call(
  'reviews.create',
  customer.withCsrf({
    product_id: product.id,
    rating: 5,
    comment: 'Automated production smoke review',
    images: [],
  }),
);
assert(
  review.review?.verified_purchase === true,
  'Review was not marked verified_purchase from order history',
);
const returnRequest = await customer.call(
  'customer.return.request',
  customer.withCsrf({ order_no: order.order_no, reason: 'Automated smoke test return request' }),
);
assert(returnRequest.return_request?.status === 'requested', 'Return request was not created');

console.log(
  JSON.stringify(
    {
      ok: true,
      flow: ['health', 'register', 'wishlist', 'checkout', 'admin-status', 'tracking', 'review', 'return'],
      orderNo: order.order_no,
      productId: product.id,
      verifiedPurchase: review.review.verified_purchase,
    },
    null,
    2,
  ),
);
