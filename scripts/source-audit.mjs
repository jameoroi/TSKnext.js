import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const problems = [];
const checks = [];
const pass = (name, ok, note = '') => { checks.push({ name, ok, note }); if (!ok) problems.push(`${name}${note ? `: ${note}` : ''}`); };
const exists = (p) => fs.existsSync(path.join(root, p));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const expectedPages = [
  '/', '/about', '/account', '/admin', '/admin/agents', '/admin/brands', '/admin/categories', '/admin/chat', '/admin/commissions',
  '/admin/content', '/admin/coupons', '/admin/crm', '/admin/flash-sale', '/admin/inventory', '/admin/kits', '/admin/marketplace',
  '/admin/operations', '/admin/orders', '/admin/products', '/admin/products-export', '/admin/products-import', '/admin/purchase-order',
  '/admin/report', '/admin/reports', '/admin/settings', '/admin/settlements', '/admin/suppliers', '/admin/team', '/agent', '/agent/settings',
  '/agent/store', '/brands', '/cart', '/checkout', '/compare', '/contact', '/kits', '/login', '/news', '/operations/network', '/owner',
  '/partner-register', '/partners', '/privacy', '/product', '/products', '/products/:id', '/quotation', '/report', '/returns', '/store',
  '/supplier', '/terms', '/track-order', '/verify-payment', '/videos', '/wishlist',
];
const expectedApis = [
  '/api/[...path]', '/api/ai/chat', '/api/auth/[...nextauth]', '/api/auth/legacy-bridge', '/api/cron/maintenance',
  '/api/facebook-webhook', '/api/health', '/api/kits/ai', '/api/kits/manage', '/api/kits/quote', '/api/marketplace', '/api',
  '/api/search', '/api/v1/[...path]', '/api/v1',
];
const businessCriticalActions = [
  'order.create','order.track','checkout.stock.validate','coupon.validate','payment.promptpay_qr','payment.omise.charge','payment.slip.upload',
  'customer.login','customer.register','customer.orders','customer.profile','customer.addresses.list','customer.addresses.save','customer.return.request',
  'customer.wishlist.list','customer.wishlist.toggle','reviews.list','reviews.create','products.list','products.get','products.recommend',
  'admin.dashboard.metrics','admin.orders.list','admin.order.status','admin.order.shipping','admin.slips.list','admin.slip.verify','admin.returns.list',
  'admin.customers.list','admin.customer.orders','admin.customer.note','admin.products.list','admin.products.create','admin.products.update',
  'admin.products.delete','admin.products.import.preview','admin.products.import.commit','admin.products.export','admin.categories.list',
  'admin.categories.reorder','admin.brands.list','admin.brands.reorder','admin.brands.migrate_products','admin.inventory.overview',
  'admin.inventory.adjust','admin.inventory.transfer','admin.warehouses.list','admin.reports.sales','admin.analytics.report','admin.contacts.list',
  'admin.newsletter.list','admin.newsletter.send','admin.marketplace.import.preview','admin.marketplace.import.commit','admin.suppliers.list',
  'admin.suppliers.save','admin.suppliers.assign_products','admin.settlements.list','admin.settlements.action','admin.audit.list',
  'agent.dashboard','agent.catalog.list','agent.payout.request','supplier.dashboard','supplier.fulfillment.update','business.settings.get','business.settings.save',
  'facebook.conversations.list','facebook.conversation.get','facebook.message.send','telegram.chat.admin.list','telegram.chat.admin.reply',
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules','.next','.git'].includes(entry.name)) return [];
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}
function routeFromPage(file) {
  let rel = path.relative(path.join(root, 'src/app'), file).replaceAll('\\','/');
  if (!rel.endsWith('/page.tsx') && rel !== 'page.tsx') return null;
  rel = rel === 'page.tsx' ? '' : rel.slice(0, -'/page.tsx'.length);
  const parts = rel.split('/').filter(Boolean).filter((x) => !(x.startsWith('(') && x.endsWith(')'))).map((x) => x.startsWith('[') && x.endsWith(']') ? `:${x.slice(1,-1)}` : x);
  return '/' + parts.join('/');
}
function routeFromApi(file) {
  let rel = path.relative(path.join(root, 'src/app'), file).replaceAll('\\','/');
  if (!rel.endsWith('/route.ts')) return null;
  rel = rel.slice(0, -'/route.ts'.length);
  return '/' + rel;
}

const files = walk(root);
const pageRoutes = new Set(files.filter((f) => f.endsWith(`${path.sep}page.tsx`) || f.endsWith('/page.tsx')).map(routeFromPage).filter(Boolean));
const apiRoutes = new Set(files.filter((f) => f.includes(`${path.sep}src${path.sep}app${path.sep}api${path.sep}`) && f.endsWith(`${path.sep}route.ts`)).map(routeFromApi).filter(Boolean));
pass('57 application routes', pageRoutes.size === 57, `${pageRoutes.size}`);
for (const route of expectedPages) pass(`Page ${route}`, pageRoutes.has(route));
pass('15 API routes', apiRoutes.size === 15, `${apiRoutes.size}`);
for (const route of expectedApis) pass(`API ${route}`, apiRoutes.has(route));

const apiSource = read('src/legacy-api/api.js');
const actionMatches = [...apiSource.matchAll(/action\s*===\s*['\"]([^'\"]+)['\"]/g)].map((m) => m[1]);
const actionSet = new Set(actionMatches);
pass('187 commerce actions', actionSet.size === 187, `${actionSet.size}`);
for (const action of businessCriticalActions) pass(`Business action ${action}`, actionSet.has(action));

const requiredFiles = [
  'src/components/site/header.tsx','src/components/site/storefront-chrome.tsx','src/components/site/trust-strip.tsx',
  'src/components/commerce/cart-view.tsx','src/components/commerce/checkout-form.tsx','src/components/commerce/product-detail-actions.tsx',
  'src/components/kits/equipment-kit-builder.tsx','src/components/admin/kit-manager.tsx','src/components/admin/operations-manager.tsx',
  'src/components/admin/supplier-network-manager.tsx','src/components/admin/crm-manager.tsx','src/components/admin/marketplace-manager.tsx',
  'src/components/admin/facebook-inbox.tsx','src/components/admin/inventory-manager.tsx','src/components/admin/backend-status.tsx',
  'src/server/equipment-kits.ts','src/shared/kit-quote.mjs','src/legacy-api/lib/relational-orders.js','src/server/catalog.ts','src/server/db/schema.ts',
  'database/migrations/20260912100000_next_relational_core.sql','database/migrations/20260912113000_order_projection.sql',
  'docs/ARCHITECTURE-TH.md','docs/FEATURES-TH.md','docs/ERD-TH.md','docs/SYSTEM-FLOWS-TH.md','docs/API-REFERENCE-TH.md',
  'docs/DATABASE-TH.md','docs/EQUIPMENT-KIT-BUILDER-TH.md','docs/ENVIRONMENT-TH.md','docs/DEPLOYMENT-TH.md',
];
for (const file of requiredFiles) pass(`Required ${file}`, exists(file));

const activeCode = files.filter((f) => f.includes(`${path.sep}src${path.sep}`) && /\.(?:ts|tsx|js|mjs)$/.test(f));
const allText = activeCode.map((f) => fs.readFileSync(f,'utf8')).join('\n');
for (const token of ['เข้าสู่ระบบ / สมัครสมาชิก','จัดเซ็ตอุปกรณ์','รายการโปรด','เปรียบเทียบ','ตะกร้า','PromptPay','COD','LINE','Meilisearch','bullmq']) {
  pass(`Feature token ${token}`, allText.includes(token));
}
for (const forbidden of ['.vue','useNuxt','defineNuxt','from \'nuxt\'','from \"nuxt\"']) {
  const hit = forbidden === '.vue' ? files.some((f) => f.endsWith('.vue')) : allText.includes(forbidden);
  pass(`No ${forbidden}`, !hit);
}
for (const forbidden of ['LEGACY-ENGINEERING-NOTES.md','LEGACY-PRODUCTION-NOTES.md','MIGRATION-STATUS.md','MIGRATION-AUDIT.json','SOURCE-SYNTAX-AUDIT.json','.env.legacy.example','src/legacy-reference']) {
  pass(`No obsolete artifact ${forbidden}`, !exists(forbidden));
}

const pkg = JSON.parse(read('package.json'));
pass('Release version', pkg.version === '6.0.0', pkg.version);
pass('Next.js 16.3.4', pkg.dependencies?.next === '16.3.4', pkg.dependencies?.next || 'missing');
pass('React 19.2', String(pkg.dependencies?.react || '').startsWith('19.2'), pkg.dependencies?.react || 'missing');

console.log(`THAISERKIT source completeness audit v${pkg.version}`);
for (const check of checks) console.log(`${check.ok ? '✓' : '✗'} ${check.name}${check.note ? ` — ${check.note}` : ''}`);
console.log(`\n${checks.filter((x) => x.ok).length}/${checks.length} checks passed`);
if (problems.length) {
  console.error('\nSource audit failed:');
  problems.forEach((p) => console.error(`- ${p}`));
  process.exit(1);
}
