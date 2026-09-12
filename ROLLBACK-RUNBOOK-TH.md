# Production Rollback — Next.js

เอกสารนี้ใช้กับ deployment ของ THAISERKIT Next.js เท่านั้น.

1. หยุด mutation ที่เสี่ยงซ้ำ (payment/webhook/import) หาก incident เกี่ยวกับข้อมูล.
2. Roll back application ไป deployment Next.js ที่ผ่าน smoke tests ล่าสุด.
3. อย่า rollback database migration ที่มีข้อมูลใหม่ด้วยการ drop table ทันที; ใช้ additive rollback/fix-forward เว้นแต่มี verified backup.
4. ตรวจ `/api/health`, login, orders, stock, payment webhooks และ workers หลัง rollback.
5. หาก queue มี failed/retry jobs ให้ pause worker ก่อนแล้วตรวจ idempotency key ก่อน replay.
6. บันทึก request ID / order ID / payment reference / deployment SHA เพื่อทำ post-incident audit.
