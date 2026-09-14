# แผนผังหน้าที่ Framework และ Library

เอกสารนี้เป็นสัญญาการแบ่งหน้าที่ของ dependency ทั้งหมดในโปรเจกต์ THAISERKIT SUPPLY
ไม่มีการถอด framework หรือ library ออก หน้าที่ของแต่ละตัวต้องไม่ซ้ำกันโดยไม่จำเป็น และ
จุดเชื่อมต่อระหว่างชั้นต้องไหลทิศทางเดียว: route → service → data/integration → UI state → view

## กติกาหลัก

- Next.js เป็นตัว orchestrate route, server rendering, API route และ production build
- Turbopack ใช้เป็น dev bundler ผ่าน `pnpm dev`; Cloudflare production ใช้ Webpack ผ่าน OpenNext เพราะ Turbopack เป็นเครื่องมือ build ไม่ใช่ runtime ที่ส่งไปกับหน้าเว็บ
- React เป็นตัวประกอบ UI; Tailwind/CSS เป็นตัวกำหนด layout และ visual system
- Radix ใช้กับ primitive ที่ต้องการ accessibility สูง; MUI ใช้กับงาน data-heavy ของ portal/admin
- TanStack Query รับผิดชอบ server state/cache; Zustand รับผิดชอบ client state ที่แชร์ข้าม component
- React Hook Form รับผิดชอบ form lifecycle; Zod รับผิดชอบ schema validation; resolver เป็น adapter
- Drizzle เป็น schema/query layer; postgres เป็น database driver; ไม่ให้ component ยิง SQL เอง
- ioredis/BullMQ รับผิดชอบ cache, rate limit และงาน background; ไม่ใช้แทนฐานข้อมูลธุรกรรม
- NextAuth รับผิดชอบ session/provider; legacy auth bridge เป็น adapter ชั่วคราวไปยัง commerce session
- OpenAI/AI SDK รับผิดชอบ AI เท่านั้น; ไม่ให้ AI เขียน order/payment โดยตรง
- S3/presigner/sharp รับผิดชอบ media pipeline; หน้าเว็บแสดงเฉพาะ URL ที่ผ่าน media policy
- Payment adapter รับผิดชอบ PromptPay/COD/Omise; checkout ต้องผ่าน stock validation ก่อน charge
- Sentry/OpenTelemetry/Pino/PostHog รับผิดชอบคนละมิติของ telemetry ห้ามฝัง secret หรือข้อมูลบัตร

## Runtime dependencies (44 ตัว)

| กลุ่ม | Package | หน้าที่เดียวหลัก | เชื่อมต่อกับ |
|---|---|---|---|
| Web | `next` | App Router, SSR, API, build | React, route handlers |
| Web | `react`, `react-dom` | Component runtime และ DOM renderer | Next |
| UI | `tailwindcss`, `@tailwindcss/postcss` | Utility CSS และ token build | globals.css, legacy theme |
| UI | `@mui/material` | ตาราง/ฟอร์ม/คอมโพเนนต์ admin ที่ซับซ้อน | Emotion, React |
| UI | `@emotion/cache`, `@emotion/react`, `@emotion/styled` | Style engine ของ MUI และ theme cache | MUI, React |
| UI | `@radix-ui/react-dialog`, `radix-ui` | Accessible primitive และ dialog; ใช้งานจริงใน auth/quick-view พร้อม `data-radix-ui` สำหรับตรวจสอบ DOM | React, CSS |
| UI | `lucide-react` | Icon system | React, Tailwind |
| UI | `motion` | Motion/transition | React, reduced-motion CSS |
| UI | `class-variance-authority`, `clsx`, `tailwind-merge` | ประกอบ class และ variant | Tailwind components |
| State | `@tanstack/react-query` | Cache/server state | API routes, query hooks |
| State | `zustand` | Cart/wishlist/compare/theme state ฝั่ง client | React components |
| Forms | `react-hook-form` | Form state และ submit lifecycle | Zod, API actions |
| Forms | `@hookform/resolvers` | Adapter schema → form errors | React Hook Form, Zod |
| Validation | `zod` | Input/env/domain schema | API, forms, auth |
| Auth | `next-auth` | Credentials/OAuth session | Auth route, legacy bridge |
| Data | `drizzle-orm` | Relational schema/query abstraction | postgres, database schema |
| Data | `postgres` | PostgreSQL driver | Drizzle, commerce storage |
| Cache/queue | `ioredis` | Redis client, lock, rate-limit primitive | Redis/Upstash |
| Cache/queue | `bullmq` | Background jobs | Redis, worker |
| Search | `meilisearch` | Catalog/full-text search | Search API, catalog service |
| AI | `ai` | AI SDK streaming/tool orchestration | OpenAI provider, kit builder |
| AI | `@ai-sdk/openai` | OpenAI provider สำหรับ AI SDK | `ai`, env keys |
| AI | `openai` | Direct OpenAI client | AI service, Zod schemas |
| Charts | `echarts` | Report/analytics visualization | Admin report view |
| Telemetry | `@sentry/nextjs` | Error/performance monitoring | Next server/client |
| Telemetry | `@opentelemetry/api`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http` | Trace API, SDK และ OTLP exporter | request logger, collector |
| Telemetry | `pino` | Structured application logs | server/worker |
| Telemetry | `posthog-js`, `posthog-node` | Consent-gated product analytics | browser/server analytics |
| Email | `resend`, `@react-email/components` | Transactional email และ email templates | order/auth/admin actions |
| Email | `nodemailer` | SMTP-compatible mail adapter | legacy email transport |
| Media | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | Object storage และ signed URL | media API, admin upload |
| Media | `sharp` | Image metadata/optimization | Next image/media pipeline |
| Commerce | `promptpay-qr` | PromptPay QR payload | payment promptpay adapter |
| Commerce | `qrcode` | QR render/export | payment UI, invoice/review |

## Development, build และ verification dependencies (20 ตัว)

| กลุ่ม | Package | หน้าที่เดียวหลัก |
|---|---|---|
| Type safety | `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/qrcode` | Compile-time type checking |
| Test | `vitest`, `@vitest/coverage-v8` | Unit test และ coverage |
| Test | `@playwright/test` | Browser E2E desktop/mobile |
| Test | `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` | Component interaction assertions |
| Test | `msw`, `jsdom` | API mocking และ DOM test environment |
| Lint | `@biomejs/biome` | Format/lint ที่เป็น gate ก่อน merge |
| Runtime tool | `tsx` | Run TypeScript scripts/worker |
| Database tool | `drizzle-kit` | Generate/migrate/schema tooling |
| Next edge | `@opennextjs/cloudflare` | OpenNext adapter สำหรับ Cloudflare |
| Edge tool | `wrangler` | Cloudflare local preview/deploy |
| Dev bundler | `Turbopack` (Next.js `--turbopack`) | Fast incremental dev bundling ผ่าน `pnpm dev`; ไม่ใช่ runtime dependency ของ production | Next.js dev server |

## จุดต่อระบบที่ห้ามข้ามชั้น

| Flow | ลำดับที่ถูกต้อง | ผลลัพธ์ที่ต้องตรวจ |
|---|---|---|
| สินค้า | page → catalog service → commerce storage → normalized product DTO | ไม่มี fake product; ไม่มีข้อมูลให้แสดง placeholder ที่บอกเหตุผล |
| ซื้อสินค้า | checkout form → Zod → stock validation → order transaction → payment adapter | ห้าม charge ก่อน stock/order สำเร็จ |
| รูปภาพ | admin upload → sharp → S3/presigned URL → media policy → UI | URL ผิด/ไฟล์ไม่ใช่รูปต้องไม่ทำให้ page crash |
| Auth | login UI → NextAuth/legacy bridge → session → role guard | secret/config ไม่พร้อมต้อง fail closed และคืน error ที่อ่านได้ |
| ค้นหา | search input → API → Meilisearch/catalog fallback → result DTO | backend ล่มต้องไม่เกิด request storm หรือ 500 ว่าง |
| AI kit | form schema → AI SDK/OpenAI → validated recommendation → quote | AI ไม่มีสิทธิ์แก้ราคา/สต็อก/ออเดอร์เอง |
| Admin | role guard → server action/API → Drizzle/commerce adapter → audit log | anonymous ต้อง redirect; mutation ต้องมี CSRF/role check |

## สถานะ compatibility ที่ตรวจแล้ว

- `pnpm peers check`: ผ่าน ไม่มี peer dependency issue
- `@vitest/coverage-v8` ถูกจัดให้ตรงกับ `vitest` รุ่นที่ติดตั้ง
- peer ของ `@auth/core`/`next-auth` กับ `nodemailer` และ `openai` กับ `zod` ถูกประกาศเป็น compatibility rule ใน `pnpm-workspace.yaml`
- `@opentelemetry/core` ถูก override ให้พ้นรุ่นที่ audit แจ้ง memory-allocation vulnerability
- dependency ทุกตัวยังอยู่ใน `package.json`; การปรับครั้งนี้เป็นการจัด version/config และ integration boundary เท่านั้น
