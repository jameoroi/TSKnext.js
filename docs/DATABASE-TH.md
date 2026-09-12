# Database — PostgreSQL / Drizzle

ระบบใช้ PostgreSQL เป็นฐานข้อมูลหลัก และ Drizzle ORM เป็น typed query/schema layer ของ Next.js

## โครงสร้างข้อมูลหลัก

- `catalog_products` — แคตตาล็อกสินค้าแบบ relational ของ Next
- `categories`, `brands` — taxonomy
- `orders`, `order_items` — คำสั่งซื้อและรายการสินค้า
- `stock_ledger` — ประวัติ reserve/release/deduct/restock/adjust
- `equipment_sets`, `equipment_set_items` — ชุดอุปกรณ์และตัวเลือก variant
- `app_kv` — compatibility/document store สำหรับ business domains ที่ยังอยู่ระหว่างย้ายเป็น relational
- `products` — compatibility mirror ของระบบเดิม; Next ไม่ใช้ตารางนี้เป็น canonical catalogue

> ตารางสินค้า canonical ของ Next คือ `catalog_products` เพื่อไม่ชนกับ compatibility table ชื่อ `products` ที่อาจมีอยู่ในฐานข้อมูลเดิม

## Migration runner

ใช้ raw SQL migrations ที่ `database/migrations/*.sql` และรันด้วย:

```bash
pnpm db:migrate
```

ตัว runner `scripts/migrate.mjs` จะ:

1. เรียง migration ตาม timestamp ในชื่อไฟล์
2. เก็บสถานะใน `app_schema_migrations`
3. ตรวจ SHA-256 checksum ของ migration ที่เคย apply แล้ว
4. รัน migration ใหม่ใน transaction
5. ปฏิเสธการแก้ migration เก่าที่ถูก apply ไปแล้ว เพื่อป้องกัน schema drift

`pnpm db:generate` ยังใช้ Drizzle Kit เพื่อสร้าง migration proposal ใหม่ไว้ที่ `database/generated/` สำหรับ review ก่อนนำ SQL ที่อนุมัติแล้วเข้า `database/migrations/` ตามลำดับเวลา

## Catalogue dual-write

ระหว่างที่ compatibility API ยังต้องรองรับ document store ระบบสามารถ sync การแก้สินค้าไป `catalog_products` ด้วย:

```env
CATALOG_TABLE_DUAL_WRITE=1
```

เมื่อ product CRUD ผ่าน Commerce API สำเร็จ ระบบจะ upsert/delete native relational catalogue ด้วย ทำให้ Storefront/Search ของ Next อ่าน PostgreSQL โดยตรงได้โดยไม่ต้องรอ cutover ทุก business domain พร้อมกัน

## เงินและสต็อก

จำนวนเงินใน relational order/product core เก็บเป็น integer satang เช่น `199.00 บาท = 19900` เพื่อเลี่ยง floating-point error

Available stock ไม่เก็บซ้ำ แต่คำนวณจาก:

```text
available = stock - reserved
```

ทุก movement สำคัญควรมี ledger เพื่อ audit ย้อนหลังได้

## Commerce storage transport

Business API compatibility layer ไม่จำเป็นต้องมี Supabase URL แล้ว ถ้ามี `DATABASE_URL` ระบบจะใช้ PostgreSQL โดยตรงเป็นค่าเริ่มต้น:

```env
DATABASE_URL=postgresql://...
COMMERCE_STORAGE=postgres
```

ถ้ามี deployment เดิมที่ต้องการใช้ Supabase PostgREST ต่อ สามารถตั้ง `COMMERCE_STORAGE=supabase` พร้อม `SUPABASE_URL` และ `SUPABASE_SECRET_KEY` ได้

ผลคือ Orders/Customer/Admin/Report/Marketplace domains ที่ยังอ่าน `app_kv` สามารถทำงานบน PostgreSQL เดียวกับ Next relational core ได้ โดยไม่ถูกบังคับให้มี Supabase transport อีกชั้นหนึ่ง

## Relational order projection

ตั้งแต่ v5.2.0 ระบบ Orders ไม่ได้มีเพียง document ใน `app_kv` แล้ว แต่มี relational projection สำหรับหน้า Account, Admin และ Reports ด้วย

```text
Commerce Order Document
        │
        ├── เก็บ contract เต็มใน app_kv เพื่อ compatibility
        │
        └── mirrorOrderProjection()
                ↓
             orders
          ├── คอลัมน์ค้นหา/รายงาน
          ├── payload JSONB (ข้อมูลเต็ม)
          └── order_items
                ├── ราคา/จำนวนแบบ relational
                └── payload JSONB (variant/metadata เต็ม)
```

`payload` มีไว้รักษาข้อมูลที่ relational core ยังไม่แยกคอลัมน์ เช่น variant, agent metadata, tracking, tax invoice และ bundle metadata ทำให้การย้าย read path ไป PostgreSQL ไม่ทำข้อมูลเดิมหาย

Migration `20260912113000_order_projection.sql` จะเพิ่ม payload/index และ backfill Orders/Items จาก `app_kv` เดิมอัตโนมัติ

เปิด/ปิดได้ด้วย:

```env
RELATIONAL_ORDER_MIRROR=1
RELATIONAL_ORDER_READS=1
RELATIONAL_REPORT_READS=1
```

เมื่อเปิดค่า default เหล่านี้:

- `order.create` mirror เข้า relational tables
- payment slip / status / shipping / supplier fulfillment mirror หลัง mutation
- Customer Order History อ่าน relational ก่อน
- Admin Orders อ่าน relational ก่อน
- Admin Dashboard Metrics อ่าน relational ก่อน
- Sales/Profit Report คำนวณจาก relational rows ก่อน
- ถ้าปิด relational read ระบบยังย้อนกลับไป Commerce compatibility path ได้

จำนวนเงินจริงยังใช้ integer satang ใน relational columns ส่วน `payload` เก็บ snapshot ของ contract ต้นฉบับเพื่อ audit และ backward compatibility
