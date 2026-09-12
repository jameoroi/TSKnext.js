# System Flows

## Request / Tenant

```mermaid
flowchart LR
  U[Browser] --> C[Cloudflare]
  C --> N[Next.js]
  N --> T[Tenant resolver]
  T --> A[Auth / RBAC]
  A --> S[Domain service]
  S --> P[(PostgreSQL)]
  S --> D[(Commerce document store)]
  S --> R[(Redis)]
  S --> M[(Meilisearch)]
```

## Checkout / Stock

```mermaid
flowchart TD
  C[Cart] --> V[Validate product variant quantity stock]
  V --> O[Create order + idempotency key]
  O --> TX[PostgreSQL transaction]
  TX --> L[Lock products FOR UPDATE]
  L --> R[Reserve stock]
  R --> LED[Append stock ledger]
  LED --> P{Payment}
  P -->|Paid| D[Deduct reserved stock once]
  P -->|Cancelled/Expired| X[Release reservation]
```

## Equipment Set Builder

```mermaid
flowchart TD
  U[Job + budget + preferences] --> C[Live catalogue]
  C --> AI{OpenAI configured?}
  AI -->|yes| P[AI planner restricted to catalogue IDs]
  AI -->|no| F[Deterministic rule engine]
  P --> K[Editable kit]
  F --> K
  K --> S[Stock/budget validation]
  S --> CART[Add whole kit to cart]
```

## Background jobs

Next/API pushes jobs to Redis/BullMQ. Workers handle search sync, transactional email, image optimization and maintenance tasks with retries and structured logging.
