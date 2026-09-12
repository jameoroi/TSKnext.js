# Equipment Set Builder

Route ลูกค้า: `/kits`  
Route Admin: `/admin/kits`  
Public API: `/api/v1/kits` และ `/api/v1/kits/:idOrSlug`

## AI mode

ผู้ใช้ระบุงานที่จะทำ, งบประมาณ, ระดับผู้ใช้, แบรนด์ที่ต้องการ, ของที่มีอยู่แล้ว และเงื่อนไขเพิ่มเติม. Server จะโหลด live catalogue แล้วส่งเฉพาะ candidate ที่มีอยู่จริงให้ AI. AI ถูกห้าม invent product id, ราคา, stock, SKU หรือ brand. หลัง AI ตอบ Server ตรวจ ID/stock/quantity อีกครั้งและบังคับงบซ้ำ. ถ้า OpenAI ไม่พร้อม ระบบ deterministic rule engine จะจัดชุดจาก catalogue เดียวกันแทน.

## Manual mode

ผู้ใช้ search/filter ตามหมวดและแบรนด์, เพิ่ม/ลบสินค้า, ปรับจำนวน, ดู budget meter และเพิ่มทั้งชุดลง cart ได้ครั้งเดียว. ชุด AI/manual ปกติไม่สร้างส่วนลดเอง จึงไม่มีทางให้ client ปลอม discount.

## Curated bundle

Admin สร้างชุดใน `equipment_sets` + `equipment_set_items` และกำหนด:

- Draft / Active / Hidden
- รูป, SEO title/description
- Required / Optional item
- Product variant ที่ต้องใช้ (ถ้ามี)
- Quantity
- ส่วนลดแบบ percent หรือ fixed amount
- Clone / Edit / Delete

Stock ของ bundle ไม่ถูกเก็บซ้ำ; อ้างอิง stock ของสินค้าแต่ละชิ้นเสมอ.

## Secure bundle-discount flow

```text
/kits
  -> โหลด curated set
  -> เพิ่มสินค้าเข้า cart + เก็บ setId
  -> /api/kits/quote
       -> ตรวจ tenant
       -> ตรวจ set = active
       -> ตรวจ Required items
       -> อ่านราคาจาก PostgreSQL
       -> คำนวณ eligible subtotal + discount
       -> sign HMAC quote token
  -> cart / checkout แสดงส่วนลดที่ verify แล้ว
  -> order.create
       -> verify HMAC token
       -> verify tenant
       -> verify claimed items ยังอยู่ใน canonical cart
       -> server คำนวณราคาสินค้า/คูปอง/ค่าจัดส่งใหม่
       -> apply bundle discount
       -> บันทึก bundle_set_id / bundle_set_name / bundle_discount ลง order
```

Browser ไม่สามารถส่งตัวเลขส่วนลดให้ `order.create` แล้วเชื่อได้โดยตรง. ส่วนลดชุดจะมีผลเฉพาะเมื่อ token ที่ Next server sign ไว้ยังไม่หมดอายุและสินค้าตาม claim ยังอยู่ครบ. Secret ใช้ `KIT_QUOTE_SECRET`; ถ้าไม่ได้ตั้งจะ fallback ไป `AUTH_SECRET` / `NEXTAUTH_SECRET`.

## Cart and checkout behavior

Cart จะแสดงชื่อชุดและสถานะส่วนลด. ถ้าลูกค้าลบ Required item หรือปรับ quantity ต่ำกว่าที่ชุดกำหนด `/api/kits/quote` จะคืน `kit_requirements_not_met` และส่วนลดถูกพักทันที. Checkout ขอ quote ใหม่ก่อนสร้าง order เพื่อลดปัญหา token หมดอายุระหว่างที่ลูกค้ากรอกที่อยู่/ชำระเงิน.
