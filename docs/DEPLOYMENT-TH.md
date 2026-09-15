# Deployment

## Vercel

1. Configure environment variables.
2. รัน `pnpm db:migrate` เพื่อ apply SQL migrations แบบ checksum-verified.
3. Deploy Next.js application.
4. Run `pnpm worker:install` once, then run the worker service separately when BullMQ jobs are enabled. The worker keeps native `sharp` in `workers/`; it is intentionally excluded from the Next/OpenNext dependency graph.
5. Configure Cloudflare DNS/WAF/CDN in front if required.

## Cloudflare/OpenNext

Use `pnpm build:cloudflare` and `pnpm deploy:cloudflare` with the provided OpenNext/Wrangler configuration.

## Release gate

A release is production-verified only after:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

ก่อน deploy ให้สำรองฐานข้อมูล และหลัง deployment verify `/api/health`, login, product search, cart/checkout, payment flow, inventory mutation, reports, equipment set builder, agent/supplier portals and backup/restore.
