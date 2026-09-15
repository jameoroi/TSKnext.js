# Technology Stack

## Application

| Technology | Role |
|---|---|
| Next.js 16.3.5 | Full-stack framework / App Router / RSC / Route Handlers / Server Actions |
| React 19.2.x | UI / Server Components / Suspense |
| TypeScript 5.9.x | Type safety |
| Turbopack | Development server (`pnpm dev`); production builds use webpack for OpenNext |
| Tailwind CSS 4 | Styling for the storefront and the back office |
| Radix UI (`radix-ui`) | Storefront primitives: Dialog, Tabs, Popover, Checkbox, Collapsible |
| Emotion | CSS-in-JS for the storefront and the back office; SSR cache mounted at the root by `EmotionRegistry` |
| Material UI (MUI) | Back-office component library, scoped to `/admin` via `MuiProvider`; `pnpm audit:release` fails if `@mui` is imported outside admin |
| Lit (`lit`, `lit-element`, `lit-html`, `@lit/reactive-element`) | Web components on the storefront, e.g. `<tsk-image-zoom>` product zoom; loaded in the browser only |
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
