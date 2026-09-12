# Release Verification — THAISERKIT Next v6.0.0

เอกสารนี้อธิบายการตรวจ release ของระบบ Next ปัจจุบันเท่านั้น

## Source completeness

- 55 application routes
- 15 Next Route Handler endpoints
- 187 commerce actions
- Storefront / Customer / Admin / Agent / Supplier / Owner surfaces
- Equipment Set Builder: Manual + AI + Curated Bundle
- PostgreSQL/Drizzle relational core + order projection
- Redis/BullMQ, Meilisearch, S3/R2, Observability adapters
- Active source เป็น Next.js / React / TypeScript เท่านั้น
- Package มีเฉพาะเอกสารของระบบปัจจุบันและการใช้งานจริง

ตรวจด้วย:

```bash
pnpm audit:source
pnpm audit:release
```

## Runtime verification

เมื่อ environment เข้าถึง package registry และ external services ได้ ให้รัน:

```bash
pnpm install
pnpm db:migrate
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

จากนั้น smoke-test อย่างน้อย: Login/OAuth, Product, Cart, Checkout, PromptPay/Slip/COD, Order, Inventory, Equipment Set, Admin Report, Supplier Fulfillment, Settlement, Marketplace Sync และ Backup/Restore
