-- Rich relational order projection for Next v5.2.
--
-- The narrow relational order tables own the fields needed for transactions,
-- indexes and reporting. `payload` preserves the complete commerce contract
-- (variants, carrier/tracking, tax invoice, agent metadata, bundle data, etc.)
-- while the cutover is still in progress. This lets the back office read from
-- PostgreSQL without silently dropping fields that only existed in app_kv.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS orders_tenant_created_idx ON orders (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_tenant_payment_status_idx ON orders (tenant_id, payment_status);

DO $seed_orders$
BEGIN
  IF to_regclass('public.app_kv') IS NOT NULL THEN
    INSERT INTO orders (
      tenant_id,id,order_no,status,customer_id,name,phone,address,province,zip,
      subtotal_satang,discount_satang,shipping_satang,total_satang,payment_method,
      payment_status,coupon_code,agent_code,stock_reserved,stock_deducted,
      reservation_expires_at,idempotency_key,status_history,payload,created_at,updated_at
    )
    SELECT
      regexp_replace(namespace, '-data$', ''),
      COALESCE(NULLIF(value->>'id',''), regexp_replace(key, '^order:', '')),
      COALESCE(NULLIF(value->>'order_no',''), NULLIF(value->>'id',''), regexp_replace(key, '^order:', '')),
      CASE
        WHEN value->>'status' IN ('pending_payment','awaiting_verification','new','paid','processing','packing','shipped','completed','cancelled','refunded','expired')
          THEN (value->>'status')::order_status
        ELSE 'new'::order_status
      END,
      NULLIF(value->>'customer_id',''),
      NULLIF(value->>'name',''),
      NULLIF(value->>'phone',''),
      NULLIF(value->>'address',''),
      NULLIF(value->>'province',''),
      NULLIF(value->>'zip',''),
      CASE WHEN COALESCE(value->>'subtotal','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN ROUND((value->>'subtotal')::numeric*100)::bigint ELSE 0 END,
      CASE WHEN COALESCE(value->>'discount','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN ROUND((value->>'discount')::numeric*100)::bigint ELSE 0 END,
      CASE WHEN COALESCE(value->>'shipping','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN ROUND((value->>'shipping')::numeric*100)::bigint ELSE 0 END,
      CASE WHEN COALESCE(value->>'total','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN ROUND((value->>'total')::numeric*100)::bigint ELSE 0 END,
      NULLIF(value->>'payment_method',''),
      COALESCE(NULLIF(value->>'payment_status',''),'unpaid'),
      NULLIF(value->>'coupon_code',''),
      NULLIF(value->>'agent_code',''),
      COALESCE((value->>'stock_reserved')::boolean,FALSE),
      COALESCE((value->>'stock_deducted')::boolean,FALSE),
      CASE WHEN COALESCE(value->>'reservation_expires_at','') ~ '^20[0-9]{2}-' THEN (value->>'reservation_expires_at')::timestamptz ELSE NULL END,
      NULLIF(value->>'idempotency_key',''),
      CASE WHEN jsonb_typeof(value->'status_history')='array' THEN value->'status_history' ELSE '[]'::jsonb END,
      value,
      CASE WHEN COALESCE(value->>'created_at','') ~ '^20[0-9]{2}-' THEN (value->>'created_at')::timestamptz ELSE NOW() END,
      CASE WHEN COALESCE(value->>'updated_at','') ~ '^20[0-9]{2}-' THEN (value->>'updated_at')::timestamptz ELSE NOW() END
    FROM app_kv
    WHERE key LIKE 'order:%'
    ON CONFLICT (tenant_id,id) DO UPDATE SET
      order_no=EXCLUDED.order_no,status=EXCLUDED.status,customer_id=EXCLUDED.customer_id,
      name=EXCLUDED.name,phone=EXCLUDED.phone,address=EXCLUDED.address,province=EXCLUDED.province,zip=EXCLUDED.zip,
      subtotal_satang=EXCLUDED.subtotal_satang,discount_satang=EXCLUDED.discount_satang,
      shipping_satang=EXCLUDED.shipping_satang,total_satang=EXCLUDED.total_satang,
      payment_method=EXCLUDED.payment_method,payment_status=EXCLUDED.payment_status,
      coupon_code=EXCLUDED.coupon_code,agent_code=EXCLUDED.agent_code,
      stock_reserved=EXCLUDED.stock_reserved,stock_deducted=EXCLUDED.stock_deducted,
      reservation_expires_at=EXCLUDED.reservation_expires_at,idempotency_key=EXCLUDED.idempotency_key,
      status_history=EXCLUDED.status_history,payload=EXCLUDED.payload,updated_at=EXCLUDED.updated_at;

    INSERT INTO order_items (
      tenant_id,order_id,line_no,product_id,sku,name,unit_price_satang,quantity,line_total_satang,payload
    )
    SELECT
      regexp_replace(kv.namespace, '-data$', ''),
      COALESCE(NULLIF(kv.value->>'id',''), regexp_replace(kv.key, '^order:', '')),
      item.ordinality::integer,
      COALESCE(NULLIF(item.value->>'id',''),NULLIF(item.value->>'product_id',''),NULLIF(item.value->>'sku',''), 'line-'||item.ordinality::text),
      NULLIF(item.value->>'sku',''),
      COALESCE(NULLIF(item.value->>'name',''),NULLIF(item.value->>'sku',''),'สินค้า'),
      CASE WHEN COALESCE(item.value->>'price','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN ROUND((item.value->>'price')::numeric*100)::bigint ELSE 0 END,
      CASE WHEN COALESCE(item.value->>'qty',item.value->>'quantity','') ~ '^[0-9]+$' THEN GREATEST(1,COALESCE(item.value->>'qty',item.value->>'quantity')::integer) ELSE 1 END,
      CASE WHEN COALESCE(item.value->>'price','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN
        ROUND((item.value->>'price')::numeric*100 * (CASE WHEN COALESCE(item.value->>'qty',item.value->>'quantity','') ~ '^[0-9]+$' THEN GREATEST(1,COALESCE(item.value->>'qty',item.value->>'quantity')::integer) ELSE 1 END))::bigint
        ELSE 0 END,
      item.value
    FROM app_kv kv
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(kv.value->'items')='array' THEN kv.value->'items' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS item(value,ordinality)
    WHERE kv.key LIKE 'order:%'
    ON CONFLICT (tenant_id,order_id,line_no) DO UPDATE SET
      product_id=EXCLUDED.product_id,sku=EXCLUDED.sku,name=EXCLUDED.name,
      unit_price_satang=EXCLUDED.unit_price_satang,quantity=EXCLUDED.quantity,
      line_total_satang=EXCLUDED.line_total_satang,payload=EXCLUDED.payload;
  END IF;
END
$seed_orders$;
