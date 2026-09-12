-- The schema this repository could build from zero was not the schema the code
-- talks to.
--
-- `lib/storage.js` selects `etag` on every read, and every single write goes
-- through `rpc/app_kv_set` with the five arguments below. Neither existed in
-- any migration: the column and the function were added to the live database by
-- hand and never written down. A fresh Supabase project built from this folder
-- came up unable to serve one request — every read 400s on the unknown column,
-- every write 404s on the missing function — and there was no way to stand up a
-- staging copy, restore from backup into a new project, or test a migration.
--
-- Additive and safe to run against the existing database: the column is
-- backfilled before it is made NOT NULL, and the function is replaced rather
-- than created, so a database that already has the hand-made versions ends up
-- byte-identical to one built from scratch.
--
-- Rollback: see docs/ROLLBACK-RUNBOOK-TH.md. Dropping the function and the
-- column returns the schema to 20260817074000, but the running code requires
-- both, so a rollback of this file must be paired with a code rollback to
-- before it. Nothing here destroys data.

-- ---------------------------------------------------------------- the column
ALTER TABLE app_kv ADD COLUMN IF NOT EXISTS etag TEXT;

-- Existing rows need a value before the column can be required. Any distinct
-- value will do: an etag is only ever compared for equality against one the
-- caller was handed by a previous read.
UPDATE app_kv SET etag = gen_random_uuid()::text WHERE etag IS NULL;

ALTER TABLE app_kv ALTER COLUMN etag SET DEFAULT gen_random_uuid()::text;
ALTER TABLE app_kv ALTER COLUMN etag SET NOT NULL;

-- ------------------------------------------------------------- the CAS write
-- Compare-and-set, used by every write in the application and relied on for
-- atomicity by the inventory paths (`atomicProductMutation`), the agent payout
-- lock and the coupon consumption guard.
--
--   p_expected_etag  write only if the row still carries this etag
--   p_only_if_new    write only if the row does not exist at all
--
-- Both unset is an unconditional upsert. Returns whether the write happened
-- and the etag now in the row, so a caller that lost the race can re-read and
-- retry rather than guess.
--
-- The whole decision is one statement so it is one atomic operation under
-- READ COMMITTED: `INSERT ... ON CONFLICT DO UPDATE ... WHERE` re-checks the
-- predicate against the locked row. Reading first and then writing — the shape
-- this replaces — is exactly the lost update the inventory code was written to
-- avoid.
CREATE OR REPLACE FUNCTION app_kv_set(
  p_namespace     TEXT,
  p_key           TEXT,
  p_value         JSONB,
  p_expected_etag TEXT DEFAULT NULL,
  p_only_if_new   BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (modified BOOLEAN, new_etag TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_etag    TEXT := gen_random_uuid()::text;
  v_written TEXT;
BEGIN
  -- A conditional write against a row that no longer exists must not recreate
  -- it. The caller's etag came from a row it read; if that row has since been
  -- deleted, the update it is holding is based on something that is gone, and
  -- resurrecting it would bring back a deleted product or a released lock.
  IF p_expected_etag IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM app_kv WHERE namespace = p_namespace AND key = p_key) THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT;
    RETURN;
  END IF;

  INSERT INTO app_kv AS target (namespace, key, value, etag, updated_at)
  VALUES (p_namespace, p_key, p_value, v_etag, NOW())
  ON CONFLICT (namespace, key) DO UPDATE
    SET value = EXCLUDED.value, etag = EXCLUDED.etag, updated_at = EXCLUDED.updated_at
    WHERE NOT p_only_if_new
      AND (p_expected_etag IS NULL OR target.etag = p_expected_etag)
  RETURNING target.etag INTO v_written;

  IF v_written IS NULL THEN
    -- The conflict target matched but the WHERE refused the update: somebody
    -- else holds the row. Hand back the etag it actually carries now.
    RETURN QUERY
      SELECT FALSE, existing.etag FROM app_kv AS existing
      WHERE existing.namespace = p_namespace AND existing.key = p_key;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, v_written;
END;
$$;

-- ---------------------------------------------------------------- the indexes
-- `listPrefix` pages with ORDER BY updated_at DESC, key ASC inside one
-- namespace. Without this the catalogue sorts the whole table per page, which
-- is what made large listings walk into the Worker CPU limit.
CREATE INDEX IF NOT EXISTS app_kv_namespace_updated_idx
  ON app_kv (namespace, updated_at DESC, key ASC);

-- Every prefix scan is `key LIKE 'thing:%'`. A default btree cannot serve LIKE
-- on a non-C collation; text_pattern_ops can.
CREATE INDEX IF NOT EXISTS app_kv_namespace_key_pattern_idx
  ON app_kv (namespace, key text_pattern_ops);

-- ------------------------------------------------------------ who may read it
-- Every row in this table is merchant data: catalogues, orders, customers,
-- sessions. Only the service key the API holds may touch it. Supabase exposes
-- PostgREST to `anon` and `authenticated` by default, so both are revoked
-- explicitly rather than left to the project's defaults.
ALTER TABLE app_kv ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION app_kv_set(TEXT, TEXT, JSONB, TEXT, BOOLEAN) FROM PUBLIC;

-- anon, authenticated and service_role are Supabase's roles. This file must
-- also apply to a plain Postgres — a throwaway database for a migration test,
-- or the Neon mirror — where they do not exist and a bare GRANT aborts the
-- whole migration. Each is applied only if the role is really there.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE app_kv FROM anon;
    REVOKE ALL ON FUNCTION app_kv_set(TEXT, TEXT, JSONB, TEXT, BOOLEAN) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE app_kv FROM authenticated;
    REVOKE ALL ON FUNCTION app_kv_set(TEXT, TEXT, JSONB, TEXT, BOOLEAN) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app_kv TO service_role;
    GRANT EXECUTE ON FUNCTION app_kv_set(TEXT, TEXT, JSONB, TEXT, BOOLEAN) TO service_role;
  END IF;
END
$do$;

-- RLS is on with no permissive policy, so even a role that somehow reached the
-- table sees nothing. `service_role` bypasses RLS, which is how the API reads.
-- This is deliberate: there is no policy to add here, and adding one would be
-- the thing that opens the table up.
