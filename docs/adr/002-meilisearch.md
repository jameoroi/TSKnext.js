# ADR-002: Meilisearch for catalogue search

- Status: accepted
- Decision: keep Meilisearch as an optional search index fed by BullMQ product-sync jobs
- Context: typo-tolerant and Thai-friendly catalogue search should not turn every Worker request into a PostgreSQL full scan
- Consequences: PostgreSQL remains the source of truth; if Meilisearch is unavailable, the deterministic database/query fallback remains authoritative
