# THAISERKIT SUPPLY — Engineering guardrails

@AGENTS.md

## ห้ามทำ

- ห้าม hardcode tenant id, admin credential, API key, cookie secret หรือ credential ใด ๆ
- ห้ามส่ง `DATABASE_URL`, service key, Redis token หรือ S3 secret ไปฝั่ง client / `NEXT_PUBLIC_*`
- ห้ามเก็บ tenant context ใน mutable global variable; ใช้ request-scoped context / AsyncLocalStorage ตาม contract
- ทุก query ที่แตะข้อมูล merchant ต้องมี tenant boundary และทุก Server Action ต้อง validate input แบบ allow-list
- ห้ามปิด CSRF, rate limit, auth check หรือ idempotency เพื่อให้เทสต์ผ่าน
- ห้ามสร้าง placeholder image/data เมื่อข้อมูลจริงโหลดไม่สำเร็จโดยไม่ติดป้ายสถานะและ fallback ที่ปลอดภัย
- ห้ามเพิ่ม paid-only Cloudflare settings เช่น `limits.cpu_ms`; deployment ต้องทำงานบน Cloudflare Workers Free
- ห้ามใช้ carousel หรือ animation ที่บังคับ layout โดยไม่มี responsive fallback; motion เดิมต้องไม่ทำให้ content กระโดด/ทับกัน
- ห้ามแก้ migration ที่ apply แล้ว ให้เพิ่ม migration ใหม่และตรวจ checksum เสมอ
- ห้าม log token, password, payment secret, raw customer address หรือ payload ส่วนบุคคลที่ไม่จำเป็น
- ห้ามอ้างว่า production/deploy/test ผ่าน หากยังไม่มี output หรือหลักฐานจาก environment จริง

## Definition of done

เปลี่ยนงานทีละหมวด, รัน `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, บันทึกผลที่ fail ตามจริง และระบุ TODO/env ที่มนุษย์ต้องกรอกก่อน merge
