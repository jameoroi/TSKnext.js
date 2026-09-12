# THAISERKIT SUPPLY — Next.js Commerce Platform v6.0.0

ระบบ E-Commerce / Marketplace / Multi-Tenant แบบ Next.js เต็มระบบบน **Next.js 16.3.4 + React 19 + TypeScript**

## ระบบหลัก

- Storefront: หน้าแรก, Catalog, Search, Product Detail, Wishlist, Compare, Cart, Checkout, Order Tracking
- Equipment Set Builder: จัดเซ็ตเอง + AI Planner + Curated Bundle + Signed Server Quote
- Customer: Login/Register/OAuth, Account, Addresses, Orders, Returns, Reviews, Chat
- Admin Control Center: Products, Import/Export, Inventory/Warehouse, Orders, Slips, Returns, Customers/CRM, Reviews, Coupons, Content, Flash Sale, Media, Reports, Marketplace, Facebook Inbox, Suppliers, Settlement, Team/RBAC, Audit Log, Settings
- Agent / Supplier / Owner Portals
- PostgreSQL + Drizzle transactional/relational core, Redis + BullMQ, Meilisearch, S3/R2
- Auth.js, RBAC, CSRF, CSP, Turnstile, tenant isolation, audit logging
- PostHog, Sentry, OpenTelemetry, Pino

## Verification commands

```bash
pnpm install
pnpm db:migrate
pnpm audit:source
pnpm audit:release
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

`audit:source` ตรวจ surface ของระบบปัจจุบัน: 55 application routes, 15 API routes, 187 commerce actions, modules สำคัญ, Next-only source และเอกสารปัจจุบัน

## เริ่มใช้งาน

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

อ่านค่าที่ต้องตั้งใน `docs/ENVIRONMENT-TH.md` ก่อนเชื่อม PostgreSQL, Redis, Meilisearch, Object Storage, Email, OAuth, Marketplace และ AI

## Documentation

- `docs/ARCHITECTURE-TH.md`
- `docs/FEATURES-TH.md`
- `docs/API-REFERENCE-TH.md`
- `docs/DATABASE-TH.md`
- `docs/ERD-TH.md`
- `docs/SYSTEM-FLOWS-TH.md`
- `docs/EQUIPMENT-KIT-BUILDER-TH.md`
- `docs/ENVIRONMENT-TH.md`
- `docs/DEPLOYMENT-TH.md`
- `docs/RELEASE-VERIFICATION-TH.md`
