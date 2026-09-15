# Feature Inventory

## Storefront
หน้าแรก, hero/promotion banners, categories, brands, flash sale, promotions, articles, search suggestions, AI search, product listing/filter/sort, product detail, variants, reviews, recommendations, recently viewed, wishlist, compare, cart, coupons, checkout, PromptPay, bank transfer, COD, LINE order, payment-slip upload, order tracking, PWA, consent and SEO.

## Equipment Set Builder
- AI จัดเซ็ตจากประเภทงาน งบ ระดับผู้ใช้ แบรนด์ที่ชอบ ของที่มีแล้ว และเงื่อนไขเพิ่มเติม
- AI เลือกได้เฉพาะ product IDs จาก live catalogue
- deterministic rule engine fallback เมื่อ AI ไม่พร้อม
- Manual Builder: search/filter/add/remove/quantity/budget meter
- Curated Set: required/optional items + product variant + quantity
- เช็ก stock และคุมงบ
- เพิ่มทั้งชุดลง Cart
- Cart/Checkout ตรวจส่วนลดชุดแบบ server-authoritative
- HMAC signed bundle quote ป้องกัน browser ปลอมส่วนลด
- Required item หาย/จำนวนไม่ครบ → ระงับส่วนลดทันที
- Checkout refresh quote token ก่อน `order.create`
- Order เก็บ `bundle_set_id`, `bundle_set_name`, `bundle_discount`, `coupon_discount` แยกกัน
- Admin Bundle Manager: draft/active/hidden, required/optional item, variant, discount, SEO, clone/delete
- Public API: `/api/v1/kits`, `/api/v1/kits/:idOrSlug`

## Customer
Auth.js/social sign-in, customer login/register, profile, addresses, orders, wishlist sync, returns, reviews, chat history and password/security settings.

## Back Office
Dashboard, products, import/export, categories, brands, inventory/warehouses, orders, payment slips, returns, customers/CRM, reviews, coupons, content, flash sale, media, marketplace, agents, commissions, payouts, suppliers, team/RBAC, equipment bundles, reports, analytics, audit log, settings and owner console.

## Portals
Agent Center, commission/payout/store settings/catalog selection; Supplier fulfillment/tracking/settlement; Owner production status/backup/restore/system health.

## Native API and Runtime
Next.js 16.3.5 Route Handlers, React Server Components, Server Actions, React Compiler, offline mutation resilience with an online/offline recovery banner, tenant-aware Cache Components (disabled for the Workers target), signed equipment-set quote, PostgreSQL/Drizzle catalogue APIs, Meilisearch fallback, Redis/BullMQ, S3/R2, Sentry, OpenTelemetry, Pino, PostHog and health/readiness checks.

## Storefront parity / navigation
- Header มีข้อความ Login/Register ชัดเจนทั้ง desktop/mobile
- Category mega menu พร้อมหมวดจริง + fallback categories + subcategory search shortcuts
- Search suggestions, recent searches และ AI search
- Wishlist / Compare / Cart badges
- Mobile bottom dock
- Floating Compare summary
- Recently viewed quick-buy bar
- Header ย่อ/ซ่อนตามทิศทาง scroll และกลับมาเมื่อเลื่อนขึ้น
- Trust strip ก่อน Footer
- Footer อ่านชื่อบริษัท/ข้อมูลนิติบุคคล/ที่อยู่/โทรศัพท์/อีเมล/เวลาทำการจาก tenant site settings
- Footer แสดงช่องทางชำระเงินและ social links ที่ตั้งค่าไว้

## Relational Orders / Reports
- Order projection ไป PostgreSQL พร้อม full JSON payload
- Customer order history อ่าน relational ก่อน
- Admin orders อ่าน relational ก่อนและแสดง data-source badge
- Dashboard metrics อ่าน relational
- Sales/profit/refund/VAT/top products report อ่าน relational
- Backfill order projection จาก compatibility store ด้วย migration

## Supplier Network / Settlement

- Supplier profile, code, email, logo, category scope and active/paused/inactive status
- Fulfillment SLA and settlement terms
- Owner-only supplier credential reset with forced password change
- Product assignment from the central catalog
- Supplier fulfillment queue and tracking update
- Supplier settlement ledger: ready, remitted, hold and void with reference/note
- Supplier self-service portal with assigned products, orders, settlement visibility and password change

## CRM / Newsletter

- Contact inbox from storefront contact forms
- Search contacts and reply by transactional SMTP email
- Newsletter subscriber list and active subscriber count
- Owner-only newsletter broadcast with confirmation and backend audit
- Customer CRM rows can open the customer's order history directly

## Brand Master maintenance

- Create/update/delete brands, aliases and logo
- Storefront brand ordering with up/down controls
- Repair/link existing products to Brand Master by brand name/aliases


## Integration Operations / Runtime Readiness

- Admin แสดงสถานะ PostgreSQL, Commerce API/Storage, Redis, Meilisearch, AI, signed bundle quote, S3/R2 และ Email จาก `/api/health`
- แยก critical service failure ออกจาก optional integration ที่ยังไม่ตั้งค่า เพื่อไม่ให้ผู้ดูแลตีความข้อมูลว่างว่าเป็นยอดจริง
- Marketplace/Facebook credentials จัดการได้จาก Owner settings โดย secret ที่อ่านกลับมาจะถูก mask และการ save field อื่นไม่ทับ secret เดิม
- ทดสอบ SMTP จากหน้า Settings ได้โดยไม่ต้องแก้ ENV/โค้ดเมื่อใช้ database-stored business settings

## Marketplace Central Catalog Import

- เชื่อม Shopee/Lazada OAuth
- ดึง remote products
- Preview mapping Brand/Category ก่อน import
- แสดงสถานะ ready/review และ mapping notes
- Commit เข้า Central Catalog พร้อม marketplace source/source ID
- เลือก Draft หรือเปิดขายทันทีหลัง import
- Product sync รายชิ้น / ที่เลือก / ทั้งหมดกลับไป Marketplace

## Facebook Messenger Back Office

- Tenant-aware Facebook webhook
- HMAC signature verification ด้วย `FACEBOOK_APP_SECRET` (fail closed เมื่อไม่ได้ตั้งค่า)
- Conversation inbox, unread state และ message thread ใน Admin Chat
- Reply ผ่าน Facebook Page Access Token
- Page Access Token / Verify Token เก็บแบบ secret/masked ใน Business Settings

## Inventory maintenance

- Super Admin สามารถ Normalize inventory schema ของข้อมูลเก่าแบบ one-way
- มี confirmation, CSRF, permission check และ Audit Log
- หลัง migrate จะ reload multi-warehouse inventory ทันที
