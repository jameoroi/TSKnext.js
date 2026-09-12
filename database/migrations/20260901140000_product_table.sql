-- A table shaped like the questions the catalogue actually asks.
--
-- Everything this shop owns lives in one key-value table: `app_kv`, with the
-- whole product document in a `value` JSONB column. That is what has kept the
-- storage layer provider-neutral, and it is also why every catalogue query is
-- an expression index over JSON — `LOWER(value->>'name')`, `(value->>'price')`
-- cast to numeric — and why a filter on two fields cannot use one index for
-- both. At a thousand products nobody notices. At five thousand, with a filter,
-- a sort and facet counts on the same request, it is the whole latency budget.
--
-- This adds a real table alongside it, holding only the fields the storefront
-- filters, sorts and counts on. Nothing reads from it yet: the dual-write in
-- lib/storage.js keeps it current behind PRODUCT_TABLE_DUAL_WRITE=1, and
-- scripts/sync-product-table.mjs fills it and proves it matches. Reads move
-- over one endpoint at a time, afterwards, behind their own flag — see
-- SCALE-UPGRADE-PLAN.md P1.1.
--
-- `app_kv` stays the source of truth. Every row here is derived from a product
-- document that has already been written there, and can be rebuilt from it at
-- any time by re-running the sync. Losing this table loses nothing.
--
-- Rollback: see docs/ROLLBACK-RUNBOOK-TH.md. Set PRODUCT_TABLE_DUAL_WRITE=0
-- (or unset it) and the application stops writing here; `DROP TABLE products`
-- then returns the schema to 20260901120000. No catalogue data is lost, because
-- none of it originates here.

CREATE TABLE IF NOT EXISTS products (
  -- Same tenancy boundary as app_kv: one row per merchant per product, and no
  -- query may run without it. A missing namespace filter is how one shop
  -- answers with another shop's catalogue.
  namespace     TEXT NOT NULL,
  id            TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  slug          TEXT NOT NULL DEFAULT '',
  sku           TEXT NOT NULL DEFAULT '',
  barcode       TEXT NOT NULL DEFAULT '',
  brand         TEXT NOT NULL DEFAULT '',
  brand_id      TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT '',
  price         NUMERIC(12,2) NOT NULL DEFAULT 0,
  old_price     NUMERIC(12,2),
  stock         INTEGER NOT NULL DEFAULT 0,
  state         TEXT NOT NULL DEFAULT 'active',
  status        JSONB NOT NULL DEFAULT '[]'::jsonb,
  img           TEXT NOT NULL DEFAULT '',
  home_featured BOOLEAN NOT NULL DEFAULT FALSE,
  -- What a shopper's words are matched against, stored once rather than
  -- rebuilt on every query.
  search_text   TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- When this row was last derived from app_kv. A row older than its document
  -- is drift, and the sync script reports on exactly that.
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (namespace, id)
);

-- The storefront's default listing: what is for sale, newest first. `id` is the
-- tie-breaker for the same reason the app_kv queries carry one — without it,
-- OFFSET paging repeats and skips rows when an import gives many products the
-- same timestamp.
CREATE INDEX IF NOT EXISTS products_public_idx
  ON products (namespace, updated_at DESC, id)
  WHERE state NOT IN ('hidden','discontinued');

CREATE INDEX IF NOT EXISTS products_category_idx ON products (namespace, category, price);
CREATE INDEX IF NOT EXISTS products_brand_idx    ON products (namespace, LOWER(brand), price);
CREATE INDEX IF NOT EXISTS products_price_idx    ON products (namespace, price);
CREATE UNIQUE INDEX IF NOT EXISTS products_slug_idx ON products (namespace, slug) WHERE slug <> '';
CREATE INDEX IF NOT EXISTS products_sku_idx      ON products (namespace, LOWER(sku)) WHERE sku <> '';
-- The status array is used as a filter ("สินค้าลดราคา"), which is a containment
-- test, which is what GIN is for.
CREATE INDEX IF NOT EXISTS products_status_idx   ON products USING GIN (status jsonb_path_ops);
-- The same search the fuzzy path in api/api.js asks for, over a real column.
CREATE INDEX IF NOT EXISTS products_search_trgm_idx ON products USING GIN (search_text gin_trgm_ops);

-- Same posture as app_kv in 20260828120000: this table holds every merchant's
-- catalogue, and only the service role the API runs as may touch it.
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
-- A bare GRANT to a Supabase role aborts the whole migration on a plain
-- Postgres, which is the throwaway database a migration test uses.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE products FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE products FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE products TO service_role';
  END IF;
END
$do$;
