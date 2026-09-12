CREATE TABLE IF NOT EXISTS "equipment_sets" (
  "tenant_id" text NOT NULL,
  "id" text NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "image_url" text,
  "discount_type" text DEFAULT 'none' NOT NULL,
  "discount_value" numeric(12,2) DEFAULT '0' NOT NULL,
  "seo_title" text,
  "seo_description" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "equipment_sets_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "equipment_sets_tenant_slug_idx" ON "equipment_sets" USING btree ("tenant_id","slug");
CREATE INDEX IF NOT EXISTS "equipment_sets_tenant_status_idx" ON "equipment_sets" USING btree ("tenant_id","status");

CREATE TABLE IF NOT EXISTS "equipment_set_items" (
  "tenant_id" text NOT NULL,
  "set_id" text NOT NULL,
  "line_no" integer NOT NULL,
  "product_id" text NOT NULL,
  "variant_id" text,
  "quantity" integer DEFAULT 1 NOT NULL,
  "required" boolean DEFAULT true NOT NULL,
  "note" text,
  CONSTRAINT "equipment_set_items_tenant_set_line_pk" PRIMARY KEY("tenant_id","set_id","line_no")
);
CREATE INDEX IF NOT EXISTS "equipment_set_items_product_idx" ON "equipment_set_items" USING btree ("tenant_id","product_id");
