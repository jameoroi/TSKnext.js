-- 20260914090000_integrity_hardening
-- Referential integrity + tenant-scoped access paths the relational core
-- shipped without. New file only: applied migrations are never edited.
--
-- What this adds:
--   1. Composite FKs (order_items -> orders, stock_ledger -> orders,
--      equipment_set_items -> equipment_sets). The mirror path DELETEs and
--      re-INSERTs lines per order; without FKs a crash between the two (or
--      any future writer) leaves orphan lines no query can attribute.
--   2. Tenant-scoped indexes for the exact predicates the code runs:
--      order_items by (tenant, order) — the mirror DELETE and the
--      release/deduct reads; equipment_set_items by (tenant, set) — the
--      storefront/API line queries; orders expiry by (tenant, expires_at);
--      ai_usage by (tenant, feature, created_at).
--   3. Idempotency that actually deduplicates: the old unique index covered
--      (tenant, idempotency_key) where the key is NULL on every row written
--      before order.create persisted it — and NULLs never collide in
--      Postgres. Replaced with a partial unique index over non-NULL keys.
--
-- Staging note: the FKs are added NOT VALID and then VALIDATED so a deploy
-- with pre-existing orphan rows fails loudly at migrate time instead of
-- silently keeping the hole. Clean orphans first if VALIDATE reports any.

-- 1. Foreign keys -----------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_order_fk') THEN
    ALTER TABLE order_items
      ADD CONSTRAINT order_items_order_fk
      FOREIGN KEY (tenant_id, order_id) REFERENCES orders (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_ledger_order_fk') THEN
    ALTER TABLE stock_ledger
      ADD CONSTRAINT stock_ledger_order_fk
      FOREIGN KEY (tenant_id, order_id) REFERENCES orders (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_set_items_set_fk') THEN
    ALTER TABLE equipment_set_items
      ADD CONSTRAINT equipment_set_items_set_fk
      FOREIGN KEY (tenant_id, set_id) REFERENCES equipment_sets (tenant_id, id) NOT VALID;
  END IF;
END
$$;

ALTER TABLE order_items VALIDATE CONSTRAINT order_items_order_fk;
ALTER TABLE stock_ledger VALIDATE CONSTRAINT stock_ledger_order_fk;
ALTER TABLE equipment_set_items VALIDATE CONSTRAINT equipment_set_items_set_fk;

-- 2. Tenant-scoped access-path indexes ---------------------------------------
CREATE INDEX IF NOT EXISTS order_items_tenant_order_idx
  ON order_items (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS equipment_set_items_tenant_set_idx
  ON equipment_set_items (tenant_id, set_id);
CREATE INDEX IF NOT EXISTS orders_tenant_reservation_expiry_idx
  ON orders (tenant_id, reservation_expires_at);
CREATE INDEX IF NOT EXISTS ai_usage_logs_tenant_feature_created_idx
  ON ai_usage_logs (tenant_id, feature, created_at);

-- Superseded single-scope indexes. Dropping an index loses no data; the
-- tenant-scoped replacements above serve the same queries.
DROP INDEX IF EXISTS ai_usage_logs_feature_created_idx;
DROP INDEX IF EXISTS orders_reservation_expiry_idx;

-- 3. Enforceable idempotency ---------------------------------------------------
DROP INDEX IF EXISTS orders_tenant_idempotency_idx;
CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_idempotency_key_idx
  ON orders (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
