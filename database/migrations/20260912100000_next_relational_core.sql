-- THAISERKIT Next relational core.
--
-- `products` is intentionally NOT reused here. Older installations may already
-- have a compatibility/derived `products(namespace, ...)` table. The Next
-- application owns `catalog_products(tenant_id, ...)`, which prevents a schema
-- collision and allows the compatibility mirror to coexist during cutover.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS categories (
  tenant_id   TEXT NOT NULL,
  key         TEXT NOT NULL,
  name        TEXT NOT NULL,
  icon        TEXT,
  image_url   TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS brands (
  tenant_id   TEXT NOT NULL,
  id          TEXT NOT NULL,
  name        TEXT NOT NULL,
  aliases     JSONB NOT NULL DEFAULT '[]'::jsonb,
  logo_url    TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS catalog_products (
  tenant_id          TEXT NOT NULL,
  id                 TEXT NOT NULL,
  sku                TEXT,
  name               TEXT NOT NULL,
  slug               TEXT,
  description        TEXT,
  brand              TEXT,
  category_key       TEXT,
  barcode            TEXT,
  price_satang       BIGINT NOT NULL DEFAULT 0,
  old_price_satang   BIGINT,
  stock              INTEGER NOT NULL DEFAULT 0,
  reserved           INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'active',
  image_url          TEXT,
  images             JSONB NOT NULL DEFAULT '[]'::jsonb,
  detail_images      JSONB NOT NULL DEFAULT '[]'::jsonb,
  specs              JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_id          TEXT,
  source_url         TEXT,
  marketplace_source TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS catalog_products_tenant_category_idx ON catalog_products (tenant_id, category_key);
CREATE INDEX IF NOT EXISTS catalog_products_tenant_brand_idx ON catalog_products (tenant_id, brand);
CREATE INDEX IF NOT EXISTS catalog_products_tenant_status_idx ON catalog_products (tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_products_tenant_sku_idx ON catalog_products (tenant_id, sku);
CREATE INDEX IF NOT EXISTS catalog_products_name_trgm_idx ON catalog_products USING GIN (name gin_trgm_ops);

-- Bootstrap the native catalogue from the current document store when app_kv
-- is present. `{tenant}-data` is the canonical data namespace shape.
DO $seed$
BEGIN
  IF to_regclass('public.app_kv') IS NOT NULL THEN
    INSERT INTO catalog_products (
      tenant_id,id,sku,name,slug,description,brand,category_key,barcode,
      price_satang,old_price_satang,stock,reserved,status,image_url,images,
      detail_images,specs,source_id,source_url,marketplace_source,created_at,updated_at
    )
    SELECT
      regexp_replace(namespace, '-data$', ''),
      COALESCE(NULLIF(value->>'id',''), regexp_replace(key, '^product:', '')),
      NULLIF(value->>'sku',''),
      COALESCE(NULLIF(value->>'name',''), 'Unnamed product'),
      NULLIF(value->>'slug',''),
      NULLIF(COALESCE(value->>'description', value->>'desc'),'') ,
      NULLIF(value->>'brand',''),
      NULLIF(value->>'category',''),
      NULLIF(value->>'barcode',''),
      CASE WHEN COALESCE(value->>'price','') ~ '^[0-9]+([.][0-9]+)?$' THEN ROUND((value->>'price')::numeric * 100)::bigint ELSE 0 END,
      CASE
        WHEN COALESCE(value->>'oldPrice', value->>'old_price','') ~ '^[0-9]+([.][0-9]+)?$'
          THEN ROUND(COALESCE(value->>'oldPrice', value->>'old_price')::numeric * 100)::bigint
        ELSE NULL
      END,
      CASE WHEN COALESCE(value->>'stock','') ~ '^-?[0-9]+$' THEN GREATEST(0,(value->>'stock')::integer) ELSE 0 END,
      CASE WHEN COALESCE(value->>'reserved','') ~ '^-?[0-9]+$' THEN GREATEST(0,(value->>'reserved')::integer) ELSE 0 END,
      COALESCE(NULLIF(value->>'state',''), 'active'),
      NULLIF(COALESCE(value->>'img', value->>'imageUrl', value->>'image_url'),'') ,
      CASE
        WHEN jsonb_typeof(value->'images')='array' THEN value->'images'
        WHEN COALESCE(value->>'img','')<>'' THEN jsonb_build_array(value->>'img')
        ELSE '[]'::jsonb
      END,
      CASE WHEN jsonb_typeof(value->'detail_images')='array' THEN value->'detail_images' ELSE '[]'::jsonb END,
      CASE WHEN jsonb_typeof(value->'specs')='object' THEN value->'specs' ELSE '{}'::jsonb END,
      NULLIF(value->>'source_id',''),
      NULLIF(value->>'source_url',''),
      NULLIF(value->>'marketplace_source',''),
      CASE WHEN COALESCE(value->>'created_at','') ~ '^20[0-9]{2}-' THEN (value->>'created_at')::timestamptz ELSE NOW() END,
      CASE WHEN COALESCE(value->>'updated_at','') ~ '^20[0-9]{2}-' THEN (value->>'updated_at')::timestamptz ELSE NOW() END
    FROM app_kv
    WHERE key LIKE 'product:%'
    ON CONFLICT (tenant_id,id) DO UPDATE SET
      sku=EXCLUDED.sku,
      name=EXCLUDED.name,
      slug=EXCLUDED.slug,
      description=EXCLUDED.description,
      brand=EXCLUDED.brand,
      category_key=EXCLUDED.category_key,
      barcode=EXCLUDED.barcode,
      price_satang=EXCLUDED.price_satang,
      old_price_satang=EXCLUDED.old_price_satang,
      stock=EXCLUDED.stock,
      reserved=EXCLUDED.reserved,
      status=EXCLUDED.status,
      image_url=EXCLUDED.image_url,
      images=EXCLUDED.images,
      detail_images=EXCLUDED.detail_images,
      specs=EXCLUDED.specs,
      source_id=EXCLUDED.source_id,
      source_url=EXCLUDED.source_url,
      marketplace_source=EXCLUDED.marketplace_source,
      updated_at=EXCLUDED.updated_at;
  END IF;
END
$seed$;

DO $enum$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='order_status') THEN
    CREATE TYPE order_status AS ENUM (
      'pending_payment','awaiting_verification','new','paid','processing',
      'packing','shipped','completed','cancelled','refunded','expired'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='stock_movement') THEN
    CREATE TYPE stock_movement AS ENUM ('reserve','release','deduct','restock','adjust');
  END IF;
END
$enum$;

CREATE TABLE IF NOT EXISTS orders (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  order_no TEXT NOT NULL,
  status order_status NOT NULL DEFAULT 'new',
  customer_id TEXT,
  name TEXT,
  phone TEXT,
  address TEXT,
  province TEXT,
  zip TEXT,
  subtotal_satang BIGINT NOT NULL DEFAULT 0,
  discount_satang BIGINT NOT NULL DEFAULT 0,
  shipping_satang BIGINT NOT NULL DEFAULT 0,
  total_satang BIGINT NOT NULL DEFAULT 0,
  payment_method TEXT,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  coupon_code TEXT,
  agent_code TEXT,
  stock_reserved BOOLEAN NOT NULL DEFAULT FALSE,
  stock_deducted BOOLEAN NOT NULL DEFAULT FALSE,
  reservation_expires_at TIMESTAMPTZ,
  idempotency_key TEXT,
  status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_order_no_idx ON orders (tenant_id,order_no);
CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_idempotency_idx ON orders (tenant_id,idempotency_key);
CREATE INDEX IF NOT EXISTS orders_tenant_status_idx ON orders (tenant_id,status);
CREATE INDEX IF NOT EXISTS orders_tenant_customer_idx ON orders (tenant_id,customer_id);
CREATE INDEX IF NOT EXISTS orders_reservation_expiry_idx ON orders (reservation_expires_at);

CREATE TABLE IF NOT EXISTS order_items (
  tenant_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  line_no INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  sku TEXT,
  name TEXT NOT NULL,
  unit_price_satang BIGINT NOT NULL,
  quantity INTEGER NOT NULL,
  line_total_satang BIGINT NOT NULL,
  PRIMARY KEY (tenant_id,order_id,line_no)
);
CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items (tenant_id,product_id);

CREATE TABLE IF NOT EXISTS stock_ledger (
  tenant_id TEXT NOT NULL,
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  product_id TEXT NOT NULL,
  movement stock_movement NOT NULL,
  quantity INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,
  reserved_after INTEGER NOT NULL,
  order_id TEXT,
  reason TEXT,
  actor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS stock_ledger_product_idx ON stock_ledger (tenant_id,product_id,created_at);
CREATE INDEX IF NOT EXISTS stock_ledger_order_idx ON stock_ledger (tenant_id,order_id);

CREATE TABLE IF NOT EXISTS equipment_sets (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  image_url TEXT,
  discount_type TEXT NOT NULL DEFAULT 'none',
  discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  seo_title TEXT,
  seo_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS equipment_sets_tenant_slug_idx ON equipment_sets (tenant_id,slug);
CREATE INDEX IF NOT EXISTS equipment_sets_tenant_status_idx ON equipment_sets (tenant_id,status);

CREATE TABLE IF NOT EXISTS equipment_set_items (
  tenant_id TEXT NOT NULL,
  set_id TEXT NOT NULL,
  line_no INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  variant_id TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  PRIMARY KEY (tenant_id,set_id,line_no)
);
CREATE INDEX IF NOT EXISTS equipment_set_items_product_idx ON equipment_set_items (tenant_id,product_id);

-- The application always includes tenant_id in its predicates. Revoke the two
-- public Supabase roles when those roles exist; service/database roles remain
-- the only write path.
DO $acl$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories','brands','catalog_products','orders','order_items','stock_ledger','equipment_sets','equipment_set_items'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON TABLE %I FROM anon', t); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON TABLE %I FROM authenticated', t); END IF;
  END LOOP;
END
$acl$;
