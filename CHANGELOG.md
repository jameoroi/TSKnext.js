# Changelog

รูปแบบ release ใช้ Conventional Commits ตาม `CONTRIBUTING.md` และให้ release automation สร้างรายการจาก commit ที่ merge แล้ว

## 6.0.0

- ย้าย catalogue/order core ไป relational projection แบบ tenant-scoped
- เพิ่ม rate limiting, audit/runbook และ verification workflow
- เพิ่ม image fallback, offline shell, tax-invoice PDF endpoint และ AI usage telemetry scaffold
