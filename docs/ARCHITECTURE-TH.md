# Architecture — THAISERKIT SUPPLY Next.js 16.3.4

## High-level

```text
Browser / PWA
    │
    ▼
Cloudflare CDN / WAF
    │
    ▼
Next.js App Router
    ├── React Server Components
    ├── Server Actions
    ├── Route Handlers
    ├── Auth / RBAC / Tenant Guard
    ├── Commerce Services
    ├── Equipment Kit Services
    └── Cache Components
         │
         ├── PostgreSQL / Drizzle
         ├── Commerce Document Store
         ├── Redis / BullMQ
         ├── Meilisearch
         ├── S3 / R2
         ├── OpenAI
         └── Resend / Analytics / Observability
```

## Application domains

```text
src/app            Routes and server entry points
src/components     UI grouped by domain
src/features       Client/domain state and types
src/server         Server-side services and data access
src/business-api   Commerce action engine (where present in final package)
src/workers        BullMQ workers
src/shared         Cross-runtime helpers
```

The transactional core uses PostgreSQL for entities that need constraints, ordering, idempotency or row locks. Document-shaped settings/content/session data can remain in the commerce document store without forcing every record into a relational schema.

## Multi-tenant rule

Every relational business row contains `tenant_id`. Requests resolve tenant from the hostname. Cache tags and public metadata are tenant-aware. A multi-tenant production deployment must never fall back an unknown hostname to the first tenant.

## Rendering strategy

- Public catalogue: RSC + Cache Components where safe
- Account/admin/checkout: dynamic server data + client interactivity
- API mutations: Route Handlers with role/CSRF/idempotency validation
- Large UI interactions: client components scoped to the feature, not the full page

## Error strategy

Public catalogue reads may degrade gracefully when an optional service is down. Admin, payment, inventory and report workflows must expose a data-source failure instead of silently presenting fake zero data.
