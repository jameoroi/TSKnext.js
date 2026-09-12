CREATE TABLE IF NOT EXISTS app_kv (
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (namespace, key)
);

CREATE INDEX IF NOT EXISTS app_kv_product_state_idx
  ON app_kv (namespace, (value->>'state'))
  WHERE key LIKE 'product:%';

CREATE INDEX IF NOT EXISTS app_kv_product_category_idx
  ON app_kv (namespace, (value->>'category'))
  WHERE key LIKE 'product:%';

CREATE INDEX IF NOT EXISTS app_kv_product_brand_idx
  ON app_kv (namespace, LOWER(COALESCE(value->>'brand','')))
  WHERE key LIKE 'product:%';

CREATE INDEX IF NOT EXISTS app_kv_product_name_idx
  ON app_kv (namespace, LOWER(COALESCE(value->>'name','')) text_pattern_ops)
  WHERE key LIKE 'product:%';

CREATE INDEX IF NOT EXISTS app_kv_product_sku_idx
  ON app_kv (namespace, LOWER(COALESCE(value->>'sku','')) text_pattern_ops)
  WHERE key LIKE 'product:%';

CREATE UNIQUE INDEX IF NOT EXISTS app_kv_product_slug_idx
  ON app_kv (namespace, (value->>'slug'))
  WHERE key LIKE 'product:%' AND COALESCE(value->>'slug','') <> '';
