# Environment Configuration

ใช้ `.env.example` เป็น source of truth แล้วสร้าง `.env.local` สำหรับ local development/production secret injection.

## Core

- `DATABASE_URL` — PostgreSQL หลักสำหรับ Drizzle, relational catalogue และ commerce document store แบบ direct PostgreSQL
- `COMMERCE_STORAGE=postgres` — ค่าแนะนำ; Business API อ่าน/เขียน `app_kv` ผ่าน PostgreSQL โดยตรง
- `CATALOG_TABLE_DUAL_WRITE=1` — sync product CRUD ไป `catalog_products`
- `POSTGRES_POOL_MAX` — จำกัด connection ของ commerce compatibility adapter
- `KIT_QUOTE_SECRET` — HMAC signing สำหรับราคา/ส่วนลด Equipment Set; fallback ไป Auth secret ได้

## Optional compatibility transport

- `SUPABASE_URL`, `SUPABASE_SECRET_KEY` — ใช้เฉพาะ deployment ที่ตั้ง `COMMERCE_STORAGE=supabase`; ไม่จำเป็นเมื่อใช้ direct PostgreSQL

## Services

- `REDIS_URL` — Redis/BullMQ
- `MEILISEARCH_*` — product search index
- `OPENAI_API_KEY`, `OPENAI_MODEL` — AI chat / insights / Equipment Set Planner
- `MEDIA_*` / `S3_*` — S3-compatible object storage / Cloudflare R2
- `AUTH_*` — Auth.js + Google/Facebook/LINE providers
- `RESEND_API_KEY` / SMTP — transactional email
- payment credentials — PromptPay / Opn-Omise และ payment integrations
- Telegram / Facebook / marketplace credentials — chat, webhooks และ marketplace sync
- PostHog / Sentry / OpenTelemetry / analytics IDs — analytics/observability

ห้าม expose secret variables ผ่าน `NEXT_PUBLIC_*` และไม่ควร commit `.env.local` เข้า repository.
