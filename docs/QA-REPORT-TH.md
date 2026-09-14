# รายงานตรวจรับ THAISERKIT SUPPLY

วันที่ตรวจ: 2026-09-14
สาขา: `codex/harden-production`
โหมดทดสอบ: production build จาก `next build --webpack` + standalone start ที่ `http://127.0.0.1:3002`

## ตรวจ production เพิ่มเติม (2026-09-14)

ผลคะแนนด้านล่างเป็นของ **local ที่ไม่มี .env** เท่านั้น ไม่ใช่สถานะของ
`https://jayxtsk.shop` ซึ่งเชื่อม Supabase อยู่แล้ว:

- `/api/health` ของเว็บจริงตอบ `ok:true` และ `commerceStorage:supabase`; database relational,
  Redis, AI และ email ยังแจ้งไม่พร้อม
- `/api?action=products.list` และหน้า `/products` พบสินค้าจริง 2,133 รายการ พร้อมราคาและ stock
- การ์ดสินค้าหลายใบยังแสดงโลโก้แทนรูปสินค้า แม้ API มี `img` และ `img_variants`;
  `/media/product/...` ตอบ `media_upstream_error` ใน deployment เดิม
- พบ Cloudflare R2 bucket ชื่อ `product-media`; โค้ดรอบนี้เพิ่ม binding `PRODUCT_MEDIA`
  และอ่าน object จาก R2 ก่อน fallback ไป S3/Supabase ต้องยืนยันผลหลัง deploy
- เบราว์เซอร์มี session admin อยู่ แต่ยังไม่ได้ทดสอบ mutation หรือทำรายการซื้อจริง

ดังนั้นคะแนน catalog ของ production สูงกว่า local มาก แต่คะแนนรูปสินค้าและ checkout
ยังไม่ควรให้ 10 จนตรวจ object delivery และธุรกรรมผ่านจริง

คะแนนด้านล่างวัด “ความพร้อมของ repo ในสภาพแวดล้อมที่ตรวจ” ไม่ใช่คะแนนคุณภาพของ
framework upstream ถ้า service/credential ยังไม่ตั้งค่า คะแนนส่วนนั้นจะไม่เต็ม แม้โค้ด
จะมี adapter รองรับแล้วก็ตาม

## สรุปผล

| หัวข้อ | คะแนน | เหตุผลที่ยังไม่เต็ม 10 | สิ่งที่ต้องทำ |
|---|---:|---|---|
| Build / TypeScript | 9.5/10 | build ผ่าน แต่ runtime ที่เครื่องตรวจเป็น Node 24 ขณะที่ repo ระบุ Node `>=26 <27` | ใช้ Node 26 ใน CI/production ให้ตรง engine |
| Lint / code hygiene | 8/10 | lint ผ่านแต่ยังมี warning 513 รายการ ส่วนใหญ่ `noExplicitAny` | เปลี่ยน DTO/response จาก `any` เป็น type/schema แบบแบ่งตาม action |
| Security | 9/10 | audit และ security E2E ผ่าน; secret/backend ยังไม่พร้อมใน local | ตั้ง secret จริง, ตรวจ CSP/headers บนโดเมนจริง และหมุน credential ก่อนเปิดใช้ |
| Storefront UI | 8.5/10 | layout/โหมดมืด/placeholder อ่านได้แล้ว แต่ยังไม่มี catalog data | เติม CMS/catalog จริงและทดสอบภาพจริงทุก breakpoint |
| สีและความอ่านง่าย | 9/10 | dark surface/text ที่เคยชนกันแก้แล้ว; ยังควรทำ automated contrast gate ทุก component | รักษา contrast อย่างน้อย 4.5:1 และเพิ่ม visual regression |
| Navigation / interaction | 9/10 | E2E desktop/mobile 38/38 ผ่าน; ยังไม่ครอบคลุม mutation หลัง login | เพิ่ม authenticated E2E ด้วย test account แยก |
| สินค้า / catalog | 2/10 ใน env นี้ | `/api/health` แจ้ง commerce storage `not-configured`; products/brands/categories/content เป็นข้อมูลว่าง | ตั้ง `DATABASE_URL`/Supabase และ migrate/seed catalog จริง |
| รูปภาพ | 6/10 ใน env นี้ | logo และ chat staff โหลดได้; รูปสินค้า/แบนเนอร์จริงยังไม่มี row ให้โหลด | ตั้ง media storage/CDN และนำเข้ารูปจริง ตรวจ MIME/resize/fallback |
| Cart / checkout / order | 2/10 ใน env นี้ | ไม่มีสินค้า จึงไม่มีเส้นทาง checkout ที่ทำรายการได้ และไม่ได้ยิง mutation จริง | seed สินค้า, stock validation, order DB และ test payment sandbox |
| Payment | 2/10 ใน env นี้ | PromptPay/COD/Omise มี adapter แต่ credential/payment sandbox ไม่พร้อม | ตั้ง payment keys, webhook, idempotency และทดสอบ sandbox end-to-end |
| Customer auth | 6/10 ใน env นี้ | guard ทำงาน แต่ `AUTH_SECRET` หายจึง auth endpoint คืน 503 แบบ fail-closed | ตั้ง `AUTH_SECRET` ≥32 ตัวอักษร และตรวจ credentials/OAuth callback |
| Admin | 5/10 ใน env นี้ | anonymous guard/redirect ผ่าน แต่ยังยืนยัน dashboard/mutation จริงไม่ได้ | ตั้ง admin credential + DB แล้วทดสอบ role/CSRF/audit mutation |
| Search | 5/10 ใน env นี้ | fallback ไม่ทำให้หน้าแตก แต่ Meilisearch ไม่ได้เชื่อมต่อ | ตั้ง Meilisearch key/index และทดสอบ Thai/SKU/brand search |
| AI / kit quote | 4/10 ใน env นี้ | UI route มีอยู่ แต่ provider/key ไม่พร้อม จึงยังยืนยัน live recommendation ไม่ได้ | ตั้ง OpenAI key, quota, timeout และตรวจผลด้วย schema ก่อน quote |
| Redis / background jobs | 3/10 ใน env นี้ | Redis/BullMQ มีโค้ด แต่ health แจ้งไม่ reachable | ตั้ง Redis/Upstash และรัน worker/queue retry/lock test |
| Email | 3/10 ใน env นี้ | Resend/SMTP adapters มีอยู่ แต่ไม่มี provider config | ตั้ง Resend/SMTP และทดสอบ order/auth/admin email |
| Overall code readiness | 8/10 | โครงสร้างและ integration boundary ดีขึ้น แต่บริการภายนอกยังไม่พร้อม | ทำ deployment checklist ด้านล่างให้ครบ |
| Overall environment readiness | 5.5/10 | เครื่องตรวจยังไม่มี DB, auth secret, payment, media, search, Redis, AI, email | เติม infrastructure/config ก่อนเรียก production-ready |

## หลักฐานที่รันผ่าน

- `pnpm typecheck` ผ่าน
- `pnpm lint` ผ่าน (เหลือ warning 513 รายการ)
- `pnpm audit --prod` ผ่าน: ไม่พบ known vulnerability
- `pnpm peers check` ผ่าน: ไม่พบ peer dependency issue
- `pnpm audit:source` ผ่าน 208/208
- `pnpm audit:release` ผ่าน 161/161
- `pnpm build` ผ่าน และพบ route 58 หน้า + API 17 route ใน production artifact
- `pnpm test:e2e` ผ่าน 38/38 ทั้ง Chromium desktop และ mobile
- Browser ตรวจโหมด light/dark จาก DOM จริง: body light `rgb(247,248,246)` / dark `rgb(15,23,20)`
- Browser ตรวจ dark card text contrast ได้ประมาณ 10.08:1 และ login heading หลังแก้ได้มากกว่า 4.5:1
- CSS ทุกไฟล์ที่หน้า home อ้างถึงตอบ 200; logo และ chat staff มี natural image size จริง
- public read ที่ไม่มี storage (`site.settings`, `categories.list`, `products.list`, `brands.list`, `content.list`) ตอบ 200 พร้อม fallback ที่สื่อความหมาย
- anonymous access ไป `/admin`, `/agent`, `/supplier`, `/owner`, `/account` ถูก redirect ไป login ตาม guard

## Bug / สิ่งที่แก้ในรอบนี้

1. Dark mode ของ modern Tailwind card ไม่ผูกกับ legacy theme ทำให้พื้นกับตัวหนังสือเกือบสีเดียวกัน — เพิ่ม theme bridge สำหรับ surface, slate text, dock และ dialog
2. Login modal ใช้ `text-emerald-950` บนพื้น dark — เพิ่ม dialog-specific contrast rules ให้ heading/label/input อ่านได้
3. Placeholder แสดง token ภายใน เช่น `PROMO_BANNER_1` — เปลี่ยนเป็นข้อความสำหรับผู้ใช้ และบอกชัดว่ารอข้อมูลจากหลังบ้าน
4. Client header/footer ยิง public read ไปยัง storage ที่ยังไม่มี ทำให้เกิด 500 log storm — เพิ่ม explicit empty public response ที่ API กลาง
5. Auth.js provider fetch ทำให้หน้า login เจอ JSON parse error เมื่อ auth config ไม่ครบ — คำนวณ social provider ฝั่ง server และให้ auth route คืน 503 JSON ที่อธิบายสาเหตุ
6. Auth route เดิม throw เป็น 500 ว่างเมื่อ production ไม่มี `AUTH_SECRET` — รักษา fail-closed แต่คืน error code `auth_not_configured`
7. Standalone output ไม่ได้มี `public`/`.next/static` ทำให้ CSS/JS/รูป 404 เมื่อ start ตรง — เพิ่ม `scripts/start-standalone.mjs` ให้ sync asset ก่อนบูต server
8. `@opentelemetry/core` รุ่นที่ audit พบ vulnerability — override เป็นรุ่นที่แก้แล้ว และปรับ peer rule ให้ dependency ทั้งชุดทำงานร่วมกัน

## สิ่งที่ยังเป็น blocker ก่อนใช้งานจริง

- `COMMERCE_STORAGE`/Postgres หรือ Supabase ยังไม่พร้อม จึงไม่มีสินค้าจริง ราคา stock แบรนด์ แบนเนอร์ และบทความจริง
- `AUTH_SECRET` ยังว่าง จึง login/session/OAuth ใช้งานจริงไม่ได้ แม้ guard จะทำงานถูกต้อง
- ไม่มี payment key/webhook จึงยังยืนยันว่า “ซื้อได้จริง” ไม่ได้ และไม่มีการส่งรายการเงินจริงในการตรวจนี้
- ไม่มี admin credential/test tenant จึงยืนยันเฉพาะ anonymous guard ไม่ใช่การสร้าง/แก้สินค้า ตรวจสลิป settlement หรือส่ง newsletter จริง
- Redis, Meilisearch, OpenAI, object storage และ email ยังไม่ reachable/configured ตาม `/api/health`
- unit test runner (`pnpm test`) ยังเปิดไม่ขึ้นใน sandbox นี้ด้วย `esbuild: Cannot read directory "../../../../../..": Access is denied`; เป็นข้อจำกัด execution environment ไม่ใช่ assertion failure
- build มี warning จาก dynamic dependency expression ของ AI SDK/legacy API และ webpack cache snapshot; ไม่บล็อก build แต่ควรแยก adapter ให้ static import ได้เมื่อทำ hardening รอบถัดไป

## Deployment checklist เพื่อขยับคะแนนเป็น 10

1. ใช้ Node 26 ให้ตรงกับ `engines` และล็อกใน CI/container
2. ตั้ง `AUTH_SECRET`, admin/customer test credentials และ OAuth callback URLs
3. ตั้ง Postgres/Supabase, รัน migrations, seed catalog จริง, ตรวจ products/categories/brands/content
4. ตั้ง S3/R2/Supabase Storage, อัปโหลดรูปจริง, ตรวจ `Content-Type`, image optimization และ CDN cache
5. ตั้ง Redis และรัน worker สำหรับ BullMQ พร้อม retry/lock/retention test
6. ตั้ง Meilisearch index และตรวจ Thai/SKU/brand/filter/pagination
7. ตั้ง PromptPay/Omise/COD sandbox, webhook signature, idempotency และ stock rollback
8. ตั้ง Resend/SMTP และตรวจ email deliverability/template rendering
9. ตั้ง OpenAI/AI SDK timeout, quota, output schema และ fallback ที่ไม่เขียน order/payment
10. เพิ่ม authenticated Playwright suite สำหรับ customer/admin/agent/supplier และ unit runner ใน CI ที่ไม่ติด sandbox restriction
11. ลด lint warning โดยเริ่มจาก API DTO, admin pages และ `noExplicitAny` ที่อยู่ในเส้นทาง mutation
12. ทำ visual regression light/dark/mobile และตั้ง contrast check เป็น merge gate

## คะแนนราย framework / library ทั้งหมด 64 ตัว

คะแนนนี้เป็น integration readiness ใน repo นี้: 10 = มี config, มี test และมี service จริงยืนยันครบ;
คะแนนต่ำเพราะยังไม่ได้ตั้ง service/credential จะมีคำแนะนำแก้ในคอลัมน์สุดท้าย ไม่ได้หมายความว่า package นั้นไม่ดี

### Runtime dependencies (44)

| Package | คะแนน | ทำไมยังไม่เต็ม | แก้ให้เต็ม |
|---|---:|---|---|
| `@ai-sdk/openai` | 7/10 | provider มีแต่ไม่มี key/live test | ตั้ง key/quota และ schema test |
| `@aws-sdk/client-s3` | 6.5/10 | object storage ยังไม่ตั้ง | ตั้ง bucket/credentials และ upload test |
| `@aws-sdk/s3-request-presigner` | 6.5/10 | ยังไม่มี signed URL จริง | ทดสอบ presign/expiry/tenant isolation |
| `@emotion/cache` | 9/10 | MUI auth surface ยังไม่มี authenticated visual test | เพิ่ม admin visual regression |
| `@emotion/react` | 9/10 | ยังไม่ตรวจ theme ทุก portal | เพิ่ม theme snapshot |
| `@emotion/styled` | 9/10 | ยังไม่ตรวจ component state ครบ | เพิ่ม state/contrast test |
| `@hookform/resolvers` | 9.5/10 | flow หลักผ่าน แต่ mutation form ยังไม่มี live test | เพิ่ม authenticated form suite |
| `@mui/material` | 8.5/10 | admin ถูก guard จึงยังไม่ตรวจ table/action จริง | เพิ่ม admin test tenant |
| `@opentelemetry/api` | 8/10 | ยังไม่มี collector จริง | ตั้ง OTLP endpoint และ trace assertion |
| `@opentelemetry/exporter-trace-otlp-http` | 8/10 | ยังไม่ส่ง trace production | ตั้ง endpoint/timeout/retry |
| `@opentelemetry/sdk-node` | 8/10 | ยังไม่ตรวจ sampling/PII | ตั้ง collector และ redact test |
| `@radix-ui/react-dialog` | 9/10 | dialog หลักผ่าน แต่ยังไม่มี keyboard regression ครบ | เพิ่ม Escape/focus-trap test |
| `@react-email/components` | 7/10 | template มีแต่ email provider ไม่พร้อม | ตั้ง provider และ render/deliver test |
| `@sentry/nextjs` | 8/10 | ไม่มี DSN/live event | ตั้ง DSN และตรวจ source map/PII |
| `@tanstack/react-query` | 9/10 | query UI ผ่าน แต่ error/cache matrix ยังไม่ครบ | เพิ่ม stale/error/offline tests |
| `ai` | 7/10 | AI route มีแต่ provider ยังไม่พร้อม | ตั้ง key/timeout/structured output |
| `bullmq` | 6.5/10 | worker มีแต่ Redis ไม่ reachable | ตั้ง Redis และทดสอบ retry/idempotency |
| `class-variance-authority` | 9/10 | variant ถูกใช้แต่ไม่มี visual matrix | เพิ่ม component snapshot |
| `clsx` | 9/10 | class composition ผ่าน | เพิ่ม variant edge cases |
| `drizzle-orm` | 6/10 | schema/migrations มีแต่ DB ไม่พร้อม | migrate test DB และ transaction tests |
| `echarts` | 8/10 | chart code มีแต่ admin report ยังไม่ authenticated-test | เพิ่ม report fixtures/visual test |
| `ioredis` | 6.5/10 | Redis ยังไม่ reachable | ตั้ง TLS/health/lock test |
| `lucide-react` | 9.5/10 | icon rendering ผ่าน | ตรวจ accessible label ทุก icon button |
| `meilisearch` | 6/10 | search service ยังไม่ตั้ง | สร้าง index/synonym/Thai query test |
| `motion` | 9/10 | motion ลดตาม reduced-motion แล้ว | เพิ่ม mobile transition regression |
| `next` | 9/10 | build/route ผ่าน แต่ Node engine mismatch | ใช้ Node 26 และ production smoke |
| `next-auth` | 6.5/10 | fail-closed ถูกต้องแต่ secret หาย | ตั้ง secret/provider และ auth E2E |
| `nodemailer` | 6/10 | SMTP ยังไม่ตั้ง | ตั้ง SMTP และ send/retry test |
| `openai` | 7/10 | client มีแต่ไม่มี key | ตั้ง key/rate-limit/fallback test |
| `pino` | 8/10 | structured log มีแต่ยังมี warning noise | redact/level/rotation policy |
| `postgres` | 5.5/10 | driver มีแต่ DB ไม่ reachable | ตั้ง DB pool/migration/rollback test |
| `posthog-js` | 7/10 | consent gate มีแต่ token ไม่ตั้ง | ตั้ง project key และ consent test |
| `posthog-node` | 7/10 | server event ยังไม่ยืนยัน | ตั้ง key/PII filter/delivery test |
| `promptpay-qr` | 5.5/10 | QR adapter มีแต่ไม่มี payment flow จริง | sandbox QR/amount/webhook test |
| `qrcode` | 8/10 | QR render dependency พร้อม | ตรวจ decode/Thai amount/receipt test |
| `radix-ui` | 8.5/10 | primitive มีแต่ใช้ร่วมกับ custom CSS หลายชั้น | จำกัด boundary และ keyboard suite |
| `react` | 9.5/10 | component/E2E ผ่าน | เพิ่ม unit runner ใน CI |
| `react-dom` | 9.5/10 | production hydration ทำงาน | เพิ่ม hydration/streaming regression |
| `react-hook-form` | 9/10 | form interaction หลักผ่าน | เพิ่ม invalid/async submit suite |
| `resend` | 6/10 | provider ไม่ configured | ตั้ง key/domain และ delivery test |
| `sharp` | 8.5/10 | image path ทำงานกับ logo | ทดสอบ product/banner MIME/size matrix |
| `tailwind-merge` | 9/10 | class bridge ผ่าน | เพิ่ม conflict regression |
| `zod` | 9/10 | validation และ peer rule ผ่าน | เพิ่ม schema coverage ของทุก mutation |
| `zustand` | 9/10 | cart/theme/local state ทำงาน | เพิ่ม persistence/multi-tab tests |

### Development / build / verification dependencies (20)

| Package | คะแนน | ทำไมยังไม่เต็ม | แก้ให้เต็ม |
|---|---:|---|---|
| `@biomejs/biome` | 8.5/10 | lint ผ่านแต่ warning 513 | ลด warning และตั้ง warning budget |
| `@opennextjs/cloudflare` | 8/10 | adapter อยู่แต่ไม่ได้ deploy Cloudflare จริง | run preview/deploy smoke |
| `@playwright/test` | 9.5/10 | E2E 38/38 ผ่าน | เพิ่ม authenticated/mutation tests |
| `@tailwindcss/postcss` | 9/10 | CSS build ผ่าน | visual regression ทุก theme |
| `@testing-library/jest-dom` | 7/10 | unit runner เปิดไม่ได้ใน sandbox | แก้ CI environment แล้ว run assertions |
| `@testing-library/react` | 7/10 | component tests ยังรันไม่ได้ | ให้ Vitest run ใน CI และเพิ่ม coverage |
| `@testing-library/user-event` | 7/10 | interaction unit tests ยังรันไม่ได้ | รัน form/modal unit suite |
| `@vitest/coverage-v8` | 7/10 | coverage gate ยังไม่ถูกใช้เพราะ runner block | แก้ runner แล้วเก็บ coverage ≥80% |
| `@types/node` | 9/10 | typecheck ผ่านแต่ใช้ Node 24 ผิด engine | align Node 26 |
| `@types/qrcode` | 9/10 | compile ผ่าน | เพิ่ม typed QR contract test |
| `@types/react` | 9/10 | compile ผ่าน | lock Node/TS CI matrix |
| `@types/react-dom` | 9/10 | compile ผ่าน | hydration type regression |
| `drizzle-kit` | 6/10 | migration audit ผ่านแต่ไม่มี DB run จริง | migrate fresh DB/rollback |
| `jsdom` | 7/10 | unit environment ยังเปิดไม่ได้ | ให้ Vitest bootstrap ผ่าน |
| `msw` | 7/10 | mock handlers มีแต่ unit runner block | run mock contract tests |
| `tailwindcss` | 9/10 | build และ dark bridge ผ่าน | add token/contrast gate |
| `tsx` | 8/10 | scripts/worker มีแต่ live worker ไม่ได้รัน | run worker health test |
| `typescript` | 9/10 | `typecheck` ผ่าน | strict DTO migration ลด `any` |
| `vitest` | 4/10 | startup ติด sandbox/esbuild access denied | ใช้ CI runner ที่อ่าน workspace parent ได้ |
| `wrangler` | 7/10 | ยังไม่ได้ preview/deploy | Cloudflare preview + binding smoke |

## สรุปการคง framework

dependency เดิมยังอยู่ครบ: runtime 44 ตัว + dev/build/test 20 ตัว = 64 ตัว
ไม่มีการถอด framework/library ใดออก การปรับครั้งนี้คือ version alignment, peer compatibility,
asset runtime, error contract, theme integration และเอกสารแบ่งหน้าที่ใน
`docs/FRAMEWORK-RESPONSIBILITIES-TH.md` เท่านั้น
