# ADR-001: Drizzle over PostgreSQL for relational commerce data

- Status: accepted
- Decision: use Drizzle ORM with PostgreSQL for catalogue, orders, stock ledger, tax invoices and AI usage logs
- Context: the compatibility `app_kv` store cannot provide relational constraints or row locks for stock/order invariants
- Consequences: typed queries and SQL migrations are reviewable; deployments must run the migration runner and preserve checksums
