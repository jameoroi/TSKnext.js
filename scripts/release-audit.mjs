import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const problems = [];
const checks = [];
const pass = (name, ok, note = '') => {
  checks.push({ name, ok, note });
  if (!ok) problems.push(`${name}${note ? `: ${note}` : ''}`);
};
const exists = (relative) => fs.existsSync(path.join(root, relative));
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

pass(
  'Next.js exact stable baseline',
  pkg.dependencies?.next === '16.3.5',
  String(pkg.dependencies?.next || 'missing'),
);
pass('Application version', pkg.version === '6.0.0', String(pkg.version || 'missing'));
pass(
  'pnpm baseline',
  String(pkg.packageManager || '').startsWith('pnpm@11.'),
  String(pkg.packageManager || 'missing'),
);

const requiredRoutes = [
  'src/app/page.tsx',
  'src/app/products/page.tsx',
  'src/app/products/[id]/page.tsx',
  'src/app/cart/page.tsx',
  'src/app/checkout/page.tsx',
  'src/app/account/page.tsx',
  'src/app/wishlist/page.tsx',
  'src/app/compare/page.tsx',
  'src/app/kits/page.tsx',
  'src/app/admin/page.tsx',
  'src/app/admin/orders/page.tsx',
  'src/app/admin/reports/page.tsx',
  'src/app/admin/operations/page.tsx',
  'src/app/admin/kits/page.tsx',
  'src/app/admin/suppliers/page.tsx',
  'src/app/admin/crm/page.tsx',
  'src/app/admin/chat/page.tsx',
  'src/app/admin/marketplace/page.tsx',
  'src/app/admin/settings/page.tsx',
  'src/app/admin/inventory/page.tsx',
  'src/app/agent/page.tsx',
  'src/app/supplier/page.tsx',
  'src/app/owner/page.tsx',
];
for (const route of requiredRoutes) pass(`Route ${route}`, exists(route));

const requiredApis = [
  'src/app/api/health/route.ts',
  'src/app/api/search/route.ts',
  'src/app/api/kits/ai/route.ts',
  'src/app/api/kits/quote/route.ts',
  'src/app/api/kits/manage/route.ts',
  'src/app/api/v1/[...path]/route.ts',
];
for (const route of requiredApis) pass(`API ${route}`, exists(route));

const packageNeeds = [
  'react',
  'typescript',
  'tailwindcss',
  '@radix-ui/react-dialog',
  'radix-ui',
  '@mui/material',
  '@mui/material-nextjs',
  '@emotion/react',
  '@emotion/styled',
  '@emotion/cache',
  'motion',
  'lucide-react',
  '@tanstack/react-query',
  'zustand',
  'react-hook-form',
  'zod',
  'next-auth',
  'drizzle-orm',
  'postgres',
  'ioredis',
  'bullmq',
  'meilisearch',
  'openai',
  'ai',
  'echarts',
  'posthog-js',
  '@sentry/nextjs',
  '@opentelemetry/api',
  'pino',
  'resend',
  '@react-email/components',
  '@aws-sdk/client-s3',
  '@playwright/test',
  'vitest',
  '@testing-library/react',
  'msw',
  '@biomejs/biome',
  'lit',
];
for (const name of packageNeeds)
  pass(`Package ${name}`, Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name]));

// UI split: the storefront is Radix + Tailwind, the back office is Material UI
// (with Emotion). Package checks alone cannot see a provider being moved or
// dropped, so check where it is mounted; the storefront scan is further down.
pass(
  'Emotion SSR cache provider',
  read('src/components/admin/mui-provider.tsx').includes('AppRouterCacheProvider'),
);
pass('Material UI mounted in the admin layout', read('src/app/admin/layout.tsx').includes('<MuiProvider>'));
pass('Material UI kept off the root providers', !read('src/app/providers.tsx').includes('MuiProvider'));

const workerPkg = JSON.parse(read('workers/package.json'));
pass('Worker image optimizer package', workerPkg.dependencies?.sharp === '^0.35.4');
pass('Sharp isolated from application graph', !pkg.dependencies?.sharp && !pkg.devDependencies?.sharp);

const header = read('src/components/site/header.tsx');
for (const text of [
  'เข้าสู่ระบบ / สมัครสมาชิก',
  'หมวดหมู่สินค้า',
  'จัดเซ็ตอุปกรณ์',
  'โปรโมชั่น',
  'รายการโปรด',
  'เปรียบเทียบ',
  'ตะกร้า',
]) {
  pass(`Header action ${text}`, header.includes(text));
}
const chrome = read('src/components/site/storefront-chrome.tsx');
for (const text of ['เมนูลัด', 'เปรียบเทียบ', 'สินค้าที่เพิ่งดู', 'สั่งซื้อ'])
  pass(`Storefront chrome ${text}`, chrome.includes(text));
pass('Trust strip', exists('src/components/site/trust-strip.tsx'));

const api = read('src/legacy-api/api.js');
for (const action of [
  'order.create',
  'admin.orders.list',
  'admin.reports.sales',
  'admin.analytics.report',
  'admin.dashboard.metrics',
  'admin.inventory.adjust',
  'admin.slip.verify',
  'admin.returns.list',
  'admin.customers.list',
  'admin.reviews.list',
  'admin.payouts.list',
  'admin.inventory.migrate',
  'business.settings.test_email',
  'admin.marketplace.import.preview',
  'admin.marketplace.import.commit',
  'facebook.conversations.list',
  'facebook.conversation.get',
  'facebook.message.send',
  'admin.suppliers.list',
  'admin.suppliers.save',
  'admin.suppliers.credentials',
  'admin.suppliers.assign_products',
  'admin.settlements.list',
  'admin.settlements.action',
  'admin.contacts.list',
  'admin.newsletter.list',
  'admin.newsletter.send',
  'admin.customer.orders',
  'admin.audit.list',
  'agent.dashboard',
  'supplier.dashboard',
])
  pass(`Commerce action ${action}`, api.includes(`'${action}'`) || api.includes(`"${action}"`));

for (const [file, tokens] of [
  [
    'src/components/admin/supplier-network-manager.tsx',
    [
      'admin.suppliers.save',
      'admin.suppliers.credentials',
      'admin.suppliers.assign_products',
      'admin.settlements.action',
    ],
  ],
  [
    'src/components/admin/crm-manager.tsx',
    ['admin.contacts.list', 'admin.newsletter.list', 'admin.newsletter.send', 'email.send'],
  ],
  ['src/components/admin/operations-manager.tsx', ['admin.customer.orders', 'admin.customer.note']],
  ['src/components/admin/brand-maintenance.tsx', ['admin.brands.migrate_products']],
]) {
  pass(`Admin surface ${file}`, exists(file));
  if (exists(file)) {
    const source = read(file);
    for (const token of tokens) pass(`Admin UI contract ${token}`, source.includes(token));
  }
}

for (const [file, tokens] of [
  [
    'src/components/admin/settings-editor.tsx',
    [
      'Marketplace / Facebook',
      'business.settings.test_email',
      'business.settings.save',
      'page_access_token',
      'partner_key',
      'app_secret',
    ],
  ],
  [
    'src/components/admin/marketplace-manager.tsx',
    [
      'admin.marketplace.import.preview',
      'admin.marketplace.import.commit',
      'Preview Mapping',
      'Commit เข้า Catalog',
    ],
  ],
  [
    'src/components/admin/facebook-inbox.tsx',
    ['facebook.conversations.list', 'facebook.conversation.get', 'facebook.message.send'],
  ],
  ['src/components/admin/inventory-manager.tsx', ['admin.inventory.migrate', 'Normalize ข้อมูลเก่า']],
  ['src/components/admin/backend-status.tsx', ['/api/health', 'ระบบข้อมูลบางส่วนยังไม่พร้อม', 'Commerce API']],
]) {
  pass(`v5.4 surface ${file}`, exists(file));
  if (exists(file)) {
    const source = read(file);
    for (const token of tokens) pass(`v5.4 UI contract ${token}`, source.includes(token));
  }
}

const chatPage = read('src/app/admin/chat/page.tsx');
pass('Facebook inbox mounted in admin chat', chatPage.includes('<FacebookInbox'));
const adminShell = read('src/components/admin/admin-shell.tsx');
pass('Admin health banner mounted', adminShell.includes('<BackendStatus'));

for (const file of [
  'database/migrations/20260912100000_next_relational_core.sql',
  'database/migrations/20260912113000_order_projection.sql',
  'src/legacy-api/lib/relational-orders.js',
])
  pass(`Relational core ${file}`, exists(file));

for (const forbidden of [
  'LEGACY-ENGINEERING-NOTES.md',
  'LEGACY-PRODUCTION-NOTES.md',
  'MIGRATION-STATUS.md',
  'MIGRATION-AUDIT.json',
  'SOURCE-SYNTAX-AUDIT.json',
  '.env.legacy.example',
  'src/legacy-reference',
]) {
  pass(`No obsolete migration artifact ${forbidden}`, !exists(forbidden));
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') return [];
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}
const files = walk(root);
pass('No active Vue files', !files.some((file) => file.endsWith('.vue')));
const activeSource = files.filter(
  (file) => /\.(?:ts|tsx|js|mjs)$/.test(file) && file.includes(`${path.sep}src${path.sep}`),
);
let nuxtImports = 0;
for (const file of activeSource) {
  const source = fs.readFileSync(file, 'utf8');
  if (/from\s+['"](?:#app|nuxt|@nuxt)|useNuxt|defineNuxt/.test(source)) nuxtImports += 1;
}
pass('No active Nuxt runtime imports', nuxtImports === 0, `${nuxtImports} file(s)`);
const adminOnly = new RegExp(
  `${path.sep === '\\' ? '\\\\' : '/'}(?:app|components)${path.sep === '\\' ? '\\\\' : '/'}admin${path.sep === '\\' ? '\\\\' : '/'}`,
);
const storefrontMui = activeSource.filter(
  (file) => !adminOnly.test(file) && /from\s+['"](?:@mui|@emotion)\//.test(fs.readFileSync(file, 'utf8')),
);
pass(
  'Storefront stays on Radix + Tailwind (no @mui/@emotion outside admin)',
  storefrontMui.length === 0,
  storefrontMui.map((file) => path.relative(root, file)).join(', '),
);

console.log(`THAISERKIT Next release audit v${pkg.version}`);
for (const check of checks)
  console.log(`${check.ok ? '✓' : '✗'} ${check.name}${check.note ? ` — ${check.note}` : ''}`);
console.log(`\n${checks.filter((x) => x.ok).length}/${checks.length} checks passed`);
if (problems.length) {
  console.error('\nRelease audit failed:');
  problems.forEach((problem) => {
    console.error(`- ${problem}`);
  });
  process.exit(1);
}
