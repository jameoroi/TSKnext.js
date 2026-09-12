CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'awaiting_verification', 'new', 'paid', 'processing', 'packing', 'shipped', 'completed', 'cancelled', 'refunded', 'expired');--> statement-breakpoint
CREATE TYPE "public"."stock_movement" AS ENUM('reserve', 'release', 'deduct', 'restock', 'adjust');--> statement-breakpoint
CREATE TABLE "brands" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"logo_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"tenant_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"image_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_tenant_id_key_pk" PRIMARY KEY("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"tenant_id" text NOT NULL,
	"order_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"product_id" text NOT NULL,
	"sku" text,
	"name" text NOT NULL,
	"unit_price_satang" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"line_total_satang" bigint NOT NULL,
	CONSTRAINT "order_items_tenant_id_order_id_line_no_pk" PRIMARY KEY("tenant_id","order_id","line_no")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"order_no" text NOT NULL,
	"status" "order_status" DEFAULT 'new' NOT NULL,
	"customer_id" text,
	"name" text,
	"phone" text,
	"address" text,
	"province" text,
	"zip" text,
	"subtotal_satang" bigint DEFAULT 0 NOT NULL,
	"discount_satang" bigint DEFAULT 0 NOT NULL,
	"shipping_satang" bigint DEFAULT 0 NOT NULL,
	"total_satang" bigint DEFAULT 0 NOT NULL,
	"payment_method" text,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"coupon_code" text,
	"agent_code" text,
	"stock_reserved" boolean DEFAULT false NOT NULL,
	"stock_deducted" boolean DEFAULT false NOT NULL,
	"reservation_expires_at" timestamp with time zone,
	"idempotency_key" text,
	"status_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"sku" text,
	"name" text NOT NULL,
	"slug" text,
	"description" text,
	"brand" text,
	"category_key" text,
	"barcode" text,
	"price_satang" bigint DEFAULT 0 NOT NULL,
	"old_price_satang" bigint,
	"stock" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"image_url" text,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detail_images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"specs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_id" text,
	"source_url" text,
	"marketplace_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "stock_ledger" (
	"tenant_id" text NOT NULL,
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "stock_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"product_id" text NOT NULL,
	"movement" "stock_movement" NOT NULL,
	"quantity" integer NOT NULL,
	"stock_after" integer NOT NULL,
	"reserved_after" integer NOT NULL,
	"order_id" text,
	"reason" text,
	"actor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_ledger_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_order_no_idx" ON "orders" USING btree ("tenant_id","order_no");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_idempotency_idx" ON "orders" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_tenant_status_idx" ON "orders" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "orders_tenant_customer_idx" ON "orders" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "orders_reservation_expiry_idx" ON "orders" USING btree ("reservation_expires_at");--> statement-breakpoint
CREATE INDEX "products_tenant_category_idx" ON "products" USING btree ("tenant_id","category_key");--> statement-breakpoint
CREATE INDEX "products_tenant_brand_idx" ON "products" USING btree ("tenant_id","brand");--> statement-breakpoint
CREATE INDEX "products_tenant_status_idx" ON "products" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "products_tenant_sku_idx" ON "products" USING btree ("tenant_id","sku");--> statement-breakpoint
CREATE INDEX "stock_ledger_product_idx" ON "stock_ledger" USING btree ("tenant_id","product_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_ledger_order_idx" ON "stock_ledger" USING btree ("tenant_id","order_id");