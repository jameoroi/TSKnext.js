# Runbook Rollback Production (THAISERKIT SUPPLY)

ใช้เมื่อ release ทำให้หน้าเว็บ, API, payment, stock หรือ worker ผิดปกติ โดยให้ผู้ปฏิบัติบันทึก deployment SHA, เวลา และ order/request id ทุกครั้ง

## 1. Triage และหยุดความเสียหาย

1. เปิด incident และเก็บ Cloudflare deployment id, Git SHA, URL, status code, request id และ log tail
2. ถ้าเกี่ยวกับการตัดสต็อกหรือ payment ให้หยุดการ replay queue/webhook และปิด mutation ที่เสี่ยงซ้ำชั่วคราว
3. ตรวจ `/api/health`, login, catalogue, checkout และ order tracking เพื่อแยกว่าเป็น app, database, Redis หรือ external provider
4. ห้ามแก้ข้อมูลด้วยมือใน production ก่อนมี backup และ audit note

## 2. Rollback application

### Cloudflare Workers / OpenNext

1. เลือก deployment ล่าสุดที่ `/api/health` และ smoke test ผ่าน
2. ใช้ Cloudflare Dashboard > Workers & Pages > `thaiserxtra` > Deployments > deployment นั้น > **Rollback**
3. ถ้า rollback ผ่าน CLI ให้ใช้ `wrangler deployments list` ตรวจ SHA ก่อน แล้ว deploy artifact จาก commit ที่ยืนยันแล้วด้วย `pnpm deploy:cloudflare`
4. ตรวจว่าไม่มี `limits.cpu_ms` หรือ setting ที่ต้องใช้ paid plan; production ต้องยังอยู่บน Free plan
5. ตรวจ health, login, product images, cart/checkout, admin และ queue หลัง rollback

### GitHub

อย่า force-push หรือแก้ migration เก่าเพื่อแก้ incident ให้ revert/fix-forward เป็น commit ใหม่ แล้วให้ CI ตรวจครบก่อน deploy

## 3. Database restore / recovery

1. หยุด worker และ pause queue; ปิด writes หาก restore ทั้งฐานข้อมูล
2. ระบุ backup object จาก `BACKUP_S3_BUCKET` + `BACKUP_S3_PREFIX` และตรวจขนาด/checksum/เวลาให้ตรง incident
3. Restore ไป database ใหม่หรือ staging ก่อนเสมอ:

```bash
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$RESTORE_DATABASE_URL" backup.dump
```

4. ตรวจ `app_schema_migrations`, tenant row counts, orders, stock ledger, payment references และ foreign-key/index health
5. เปลี่ยน `DATABASE_URL` ไปยังฐานที่ตรวจแล้วด้วย secret manager/Cloudflare secret ไม่ใส่ใน Git
6. รัน `pnpm db:migrate` เฉพาะ migration ที่ยังไม่ apply และห้ามแก้ไฟล์ migration ที่มี checksum แล้ว
7. เปิด writes/worker ทีละส่วน ตรวจ idempotency และ replay webhook เฉพาะ event ที่ยืนยันว่าไม่ซ้ำ

ถ้าไม่มี `BACKUP_DATABASE_URL`, `BACKUP_S3_*` หรือ `pg_restore` ให้หยุดและ escalate ห้ามเดาค่า credential

## 4. Escalation

- L1: ผู้ดูแลร้าน — ตรวจ UX, order number, เวลาเกิดเหตุ
- L2: Senior engineer — app/CI/Cloudflare/Redis/DB triage และตัดสินใจ rollback
- L3: ผู้ดูแล database/payment/carrier — restore, reconciliation และ provider incident
- ความลับรั่วหรือสงสัย account ถูกยึด: rotate `AUTH_SECRET`, admin credential, Redis, DB, S3/R2, payment และ webhook secret ทันทีตาม `docs/SECRET-ROTATION-CHECKLIST.md`

## 5. หลังเหตุการณ์

บันทึก root cause, impact, orders ที่ต้อง reconcile, deployment ที่ rollback, backup ที่ใช้, follow-up owner และ test ที่เพิ่มใน `docs/RUNBOOK.md`/ADR
