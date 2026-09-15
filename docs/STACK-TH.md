# Technology Stack

## Application

| Technology | Role |
|---|---|
| Next.js 16.3.5 | Full-stack framework / App Router / RSC / Route Handlers / Server Actions |
| React 19.2.x | UI / Server Components / Suspense |
| TypeScript 5.9.x | Type safety |
| Turbopack | Development server (`pnpm dev`); production builds use webpack for OpenNext |
| Tailwind CSS 4 | Styling |
| Radix UI (`radix-ui`) | Primary accessible primitives: Dialog, Tabs and interactive widgets |
| Material UI (MUI) + Emotion | Component library and CSS-in-JS; Emotion SSR cache mounted once at the root via `MuiProvider` (`@layer mui`, below Tailwind utilities) |
| Motion | Animation |
| Lucide React | Icons |

## State and Forms

TanStack Query handles remote client state, Zustand handles cart/local UI state, React Hook Form handles forms, and Zod validates inputs at UI/API boundaries.

## Data and Services

- PostgreSQL + Drizzle ORM: relational commerce core and equipment bundles
- Commerce document store: settings/content/session and API document data
- Redis + BullMQ: cache, queues and workers
- Meilisearch + PostgreSQL pg_trgm: catalogue search
- S3-compatible storage / Cloudflare R2 + Sharp: media

## AI / Analytics / Observability

- OpenAI SDK + AI SDK: chat, insights and Equipment Set Builder
- ECharts: reports
- PostHog: product analytics
- Sentry: errors/performance
- OpenTelemetry: traces
- Pino: structured logs
- Resend + React Email: transactional email

## Quality / Infrastructure

Playwright, Vitest, Testing Library, MSW, Biome, pnpm, Docker, GitHub Actions, Vercel and Cloudflare.
