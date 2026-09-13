-- Financial documents and AI observability are relational by design.
-- No secret or provider credential is stored in either table.

CREATE TABLE IF NOT EXISTS tax_invoices (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  invoice_no TEXT NOT NULL,
  invoice_type TEXT NOT NULL DEFAULT 'full_tax_invoice',
  customer_name TEXT NOT NULL,
  tax_id TEXT,
  branch TEXT,
  address TEXT,
  subtotal_satang BIGINT NOT NULL DEFAULT 0,
  vat_satang BIGINT NOT NULL DEFAULT 0,
  total_satang BIGINT NOT NULL DEFAULT 0,
  pdf_object_key TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT tax_invoices_tenant_invoice_no_unique UNIQUE (tenant_id, invoice_no),
  CONSTRAINT tax_invoices_tenant_order_unique UNIQUE (tenant_id, order_id)
);

CREATE INDEX IF NOT EXISTS tax_invoices_tenant_issued_idx
  ON tax_invoices (tenant_id, issued_at DESC);

DO $tax_invoice_order_fk$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    ALTER TABLE tax_invoices
      ADD CONSTRAINT tax_invoices_order_fk
      FOREIGN KEY (tenant_id, order_id) REFERENCES orders (tenant_id, id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$tax_invoice_order_fk$;

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  feature TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  fallback BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS ai_usage_logs_tenant_created_idx
  ON ai_usage_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_logs_feature_created_idx
  ON ai_usage_logs (feature, created_at DESC);
