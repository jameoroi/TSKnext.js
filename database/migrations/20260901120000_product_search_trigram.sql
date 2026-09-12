-- Search could only answer with what a shopper typed exactly.
--
-- The product indexes added in 20260817074000 index `LOWER(name)` and
-- `LOWER(sku)` with `text_pattern_ops`, which Postgres can only use for an
-- anchored prefix (`LIKE 'makita%'`). Every real catalogue search here is
-- `LIKE '%makita%'` — unanchored — so none of those indexes were ever used for
-- the search itself, and the query fell back to reading every product row in
-- the namespace. Worse, a literal comparison has no notion of "close": one
-- transposed letter, one missing tone mark, and a shop holding the item answers
-- that it does not stock it.
--
-- Trigram indexes fix both halves. `gin_trgm_ops` is the one index type
-- Postgres can use for an unanchored `LIKE '%…%'`, and the same index answers
-- `similarity()` / the `%` operator, which is what makes a near miss findable.
-- Thai is covered as well: trigrams are computed over characters, so a word
-- differing by a single tone mark still shares most of its trigrams.
--
-- Additive: no column, row or existing index is touched, and nothing here
-- changes what a query returns on its own — the query in api/api.js decides
-- when to reach for similarity.
--
-- Rollback: see docs/ROLLBACK-RUNBOOK-TH.md. Dropping the four indexes below
-- (and, if nothing else uses it, the extension) returns the schema to
-- 20260828120000. The application keeps working without them — searches simply
-- go back to scanning. Nothing here destroys data.

-- Supabase installs extensions into the `extensions` schema, which is on the
-- default search_path; a plain Postgres puts it in `public`. Either is fine —
-- the operators below are resolved by name.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Not CONCURRENTLY: these run inside the migration's transaction, and the
-- catalogue is tens of thousands of rows, not tens of millions. Run this file
-- outside selling hours anyway — the writes it blocks are product writes.
CREATE INDEX IF NOT EXISTS app_kv_product_name_trgm_idx
  ON app_kv USING GIN (LOWER(COALESCE(value->>'name','')) gin_trgm_ops)
  WHERE key LIKE 'product:%';

CREATE INDEX IF NOT EXISTS app_kv_product_sku_trgm_idx
  ON app_kv USING GIN (LOWER(COALESCE(value->>'sku','')) gin_trgm_ops)
  WHERE key LIKE 'product:%';

CREATE INDEX IF NOT EXISTS app_kv_product_brand_trgm_idx
  ON app_kv USING GIN (LOWER(COALESCE(value->>'brand','')) gin_trgm_ops)
  WHERE key LIKE 'product:%';

-- A shopper types a phrase, not a field. Ranking a near miss means scoring the
-- whole card at once, so the fuzzy path scores this one expression rather than
-- three separate similarities.
CREATE INDEX IF NOT EXISTS app_kv_product_search_trgm_idx
  ON app_kv USING GIN (
    LOWER(COALESCE(value->>'name','') || ' ' || COALESCE(value->>'sku','') || ' ' || COALESCE(value->>'brand','')) gin_trgm_ops
  )
  WHERE key LIKE 'product:%';
