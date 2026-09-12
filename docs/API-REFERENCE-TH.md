# API Reference — THAISERKIT Next

## Native Next.js APIs

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/health` | GET | runtime/service readiness |
| `/api/search?q=` | GET | Meilisearch → catalogue fallback |
| `/api/v1/products` | GET | tenant-scoped product list |
| `/api/v1/products/:idOrSlug` | GET | product detail |
| `/api/v1/stock/:idOrSlug` | GET | stock/available/reserved view |
| `/api/v1/search?q=` | GET | PostgreSQL exact + pg_trgm fallback |
| `/api/v1/categories` | GET | categories |
| `/api/v1/brands` | GET | brands |
| `/api/v1/kits` | GET | active curated equipment sets |
| `/api/v1/kits/:idOrSlug` | GET | set detail + set items |
| `/api/kits/ai` | POST | AI/rule-based equipment planner |
| `/api/kits/quote` | POST | validate curated set + signed discount quote |
| `/api/kits/manage` | GET/POST/DELETE | admin bundle management |
| `/api/ai/chat` | POST | AI SDK streaming chat |
| `/api/auth/*` | GET/POST | Auth.js and OAuth bridge |
| `/api/cron/maintenance` | GET/POST | protected maintenance worker trigger |
| `/api/facebook-webhook` | GET/POST | Facebook webhook |
| `/api/marketplace` | GET/POST | marketplace integration route |

## Commerce API

`/api` และ `/api/[...path]` expose business actions ที่ระบบ storefront/back-office ใช้. Action ถูกกำหนดด้วย query/body `action` และทุก write ผ่าน auth/role/CSRF/rate-limit ตามประเภทงาน.

กลุ่มหลัก:

- Catalog: products, categories, brands, stock, QR, recommendations
- Checkout: stock validation, payment settings, PromptPay, coupon, order create
- Customer: login/register/profile/address/orders/wishlist/returns/reviews
- Admin: products/inventory/orders/slips/customers/coupons/reviews/media/content/reports/settings/users/audit
- Agent: dashboard/catalog/profile/commission/payout/store
- Supplier: dashboard/orders/fulfillment/password
- Marketplace: import/sync and social channels
- Chat: customer/staff/Telegram/Facebook
- Owner: production status/backups/errors/integrity

## Bundle discount security

`/api/kits/quote` ไม่รับราคา/ส่วนลดจาก browser เป็น authoritative value. Server อ่าน active set และ product price จาก PostgreSQL, ตรวจ Required items, คำนวณส่วนลด แล้ว sign HMAC token. `order.create` verify token + tenant + cart lines อีกครั้งก่อนใช้ discount.

## Error policy

Storefront read operations บางส่วนสามารถ degrade gracefully ได้ แต่ transactional/admin operations ต้องคืน explicit error. Order, inventory, payment, payout, restore และ bundle quote ห้ามเปลี่ยน API failure เป็นข้อมูลว่างที่ดูเหมือนสำเร็จ.

## Order/Report read path

หน้า Customer Orders, Admin Orders, Dashboard Metrics และ Sales Report ใช้ PostgreSQL relational projection เป็น read path หลักเมื่อ `RELATIONAL_ORDER_READS=1` / `RELATIONAL_REPORT_READS=1`.

Response ของหน้าหลังบ้านจะบอก `source` เพื่อให้ผู้ดูแลเห็นว่าข้อมูลมาจาก `relational` หรือ compatibility layer แทนการซ่อน data source หรือแสดงเลขศูนย์เมื่อ backend มีปัญหา

Mutation ของ order ยังรักษา business contract เดิม แต่จะ mirror relational projection หลัง create/payment/status/shipping/fulfillment เพื่อให้ read model สดตามข้อมูลธุรกิจ

## Supplier Network actions

- `admin.suppliers.list`
- `admin.suppliers.save`
- `admin.suppliers.credentials`
- `admin.suppliers.assign_products`
- `admin.settlements.list`
- `admin.settlements.action`
- `supplier.dashboard`
- `supplier.fulfillment.update`
- `supplier.password`

## CRM / lifecycle actions

- `admin.contacts.list`
- `email.send`
- `admin.newsletter.list`
- `admin.newsletter.send`
- `admin.customer.orders`
- `admin.customer.note`

## Brand maintenance actions

- `admin.brands.reorder`
- `admin.brands.migrate_products`


## Integration administration actions

- `business.settings.get` / `business.settings.save` — payment, SMTP, Telegram, Facebook, Shopee, Lazada (secret fields masked on read)
- `business.settings.test_email` — Super Admin SMTP smoke test
- `admin.marketplace.import.preview` — normalize remote marketplace payload and preview Brand/Category mapping
- `admin.marketplace.import.commit` — commit normalized marketplace items into Central Catalog
- `facebook.conversations.list` / `facebook.conversation.get` / `facebook.message.send` — Facebook Messenger inbox and reply
- `admin.inventory.migrate` — Super Admin one-way normalize of old inventory documents

Facebook webhook endpoint is `/api/facebook-webhook`. Verification token may come from tenant Business Settings; webhook delivery signature requires server-side `FACEBOOK_APP_SECRET` and fails closed when the secret is absent.
