# Contributing

## เริ่มจากศูนย์ภายใน 15 นาที

1. ติดตั้ง Node `>=26 <27` และ pnpm `11.16.0`
2. `pnpm install`
3. คัดลอก `.env.example` เป็น `.env.local` แล้วกรอกเฉพาะ local credentials
4. เริ่ม PostgreSQL/Redis/Meilisearch ตามค่าท้องถิ่น หรือใช้ compatibility mode ที่มีอยู่
5. `pnpm db:migrate`
6. `pnpm dev`
7. ตรวจ `/api/health` และเปิด `http://localhost:3000`

ก่อนเปิด PR ให้รัน `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. หาก environment ขาด external service ให้แนบ output จริงและอย่าปลอม secret/ผลทดสอบ

## กฎ PR

- ใช้ Conventional Commit เช่น `fix(auth): ...`, `feat(catalog): ...`, `docs(runbook): ...`
- migration ใหม่ต้องใช้ timestamp ใหม่และห้ามแก้ migration ที่ apply แล้ว
- tenant, auth, payment และ storage ต้องมี test สำหรับ unauthorized/cross-tenant case
- ห้ามใส่ `.env*`, backup, dump, token หรือ customer PII ใน commit
- การเปลี่ยน UI ต้องทดสอบ desktop/mobile และรักษา motion เดิมพร้อม layout fallback
