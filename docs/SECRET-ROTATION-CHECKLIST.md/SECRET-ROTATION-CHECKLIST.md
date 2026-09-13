# Secret rotation checklist

เอกสารนี้ระบุชื่อ secret เท่านั้น ห้ามใส่ค่าจริงลง Git, issue, log หรือเอกสาร

## ก่อนหมุน

- ระบุ environment ที่ได้รับผลกระทบ: local, CI, Cloudflare production และ worker process
- ตรวจ least privilege, วันหมดอายุ, rollback value ใน password manager และ maintenance window
- ตรวจ health check, alert และ audit log ก่อนเปลี่ยนค่า

## รายการ secret ใน .env.example

| กลุ่ม | ตัวแปร | ขั้นตอน |
|---|---|---|
| Admin/Auth | ADMIN_USERNAME, ADMIN_PASSWORD, AUTH_SECRET, AUTH_PLATFORM_PASSWORD | สร้าง credential ใหม่, อัปเดต Cloudflare Secret, ทดสอบ login/admin, revoke ค่าเดิม |
| OAuth | AUTH_GOOGLE_SECRET, AUTH_FACEBOOK_SECRET, AUTH_LINE_SECRET | หมุนใน provider console, deploy, ทดสอบ callback, revoke ค่าเดิม |
| Database | DATABASE_URL, SUPABASE_SECRET_KEY | ออก service key จำกัดสิทธิ์, ตรวจ health/migration, revoke ค่าเดิม |
| Redis | REDIS_URL, REDIS_REST_URL, REDIS_REST_TOKEN, UPSTASH_REDIS_REST_TOKEN | สร้าง token ใหม่, ทดสอบ REST PING, อัปเดต runtime, revoke ค่าเดิม |
| Storage | MEDIA_S3_ACCESS_KEY_ID, MEDIA_S3_SECRET_ACCESS_KEY, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY | จำกัด bucket, ทดสอบ read/write/delete, revoke ค่าเดิม |
| AI/Search | OPENAI_API_KEY, GEMINI_API_KEY, N8N_AI_API_KEY, MEILISEARCH_API_KEY | จำกัด scope/spend, smoke test, revoke ค่าเดิม |
| Payment | OMISE_SECRET_KEY, SLIPOK_API_KEY, SLIPOK_BRANCH_ID | หมุนใน dashboard, ทดสอบ sandbox/production, revoke ค่าเดิม |
| Email | SMTP_PASS, RESEND_API_KEY | หมุน credential, ทดสอบ sender/domain, revoke ค่าเดิม |
| Webhook | FACEBOOK_APP_SECRET, FB_PAGE_ACCESS_TOKEN, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET | หมุน provider, ทดสอบ signature/webhook, revoke ค่าเดิม |
| Ops | SENTRY_DSN, POSTHOG_KEY, CRON_SECRET, OTEL_EXPORTER_OTLP_ENDPOINT | เปลี่ยนค่า, ตรวจ event/cron, revoke ค่าเดิม |

## Deploy แบบไม่ downtime

1. เพิ่มค่าใหม่ใน Cloudflare Variables and Secrets โดยคงค่าเดิมไว้ชั่วคราว
2. Deploy source ที่อ่านค่าใหม่ แล้วตรวจ health, login, catalog, checkout และ webhook
3. ตรวจ logs ว่าไม่ใช้ค่าเดิม แล้ว revoke ค่าเดิมจาก provider
4. อัปเดต .env.local และ GitHub Actions secrets ผ่าน secret manager เท่านั้น
5. บันทึกวันหมุน, owner, provider และวันหมุนครั้งถัดไปไว้ใน password manager

หาก secret รั่ว: revoke ทันที, ตรวจ audit log, rotate ค่าเกี่ยวข้องทั้งหมด และสร้าง incident record
