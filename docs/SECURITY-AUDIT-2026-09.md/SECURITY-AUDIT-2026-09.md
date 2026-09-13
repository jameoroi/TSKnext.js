# Security audit — 2026-09

สถานะ: implemented controls reviewed; production sign-off pending

## Scope

ตรวจ src/app/api, compatibility handler ใน src/legacy-api/api.js และทุก actions.ts พร้อม auth/session, CSRF, CSP/security headers, tenant resolution, input allow-list และ mass-assignment risk

## ผลตรวจ

| พื้นที่ | ผล | หลักฐาน |
|---|---|---|
| CSRF | ผ่านตามโค้ด | mutating compatibility actions เรียก requireCsrf; Facebook webhook ตรวจ provider token/signature |
| CSP/security headers | ผ่านตามโค้ด | src/shared/security-headers.mjs ถูกผูกใน next.config.ts |
| Auth flow | ผ่านตามโค้ด | scrypt/timing-safe password verification, session cookie และ role checks |
| Rate limiting | defense-in-depth | durable KV limiter เดิม + Redis edge guard สำหรับ login/register/checkout/order และ Facebook POST |
| Tenant isolation | ผ่านตามโค้ด | tenant มาจาก host resolution; ห้ามรับ tenant จาก query ใน production |
| Mass assignment | ต้อง review ต่อ | core mutations ใช้ allow-list; ทุก action ใหม่ต้องเพิ่ม regression test |
| Secrets | ผ่านแนวทาง | source ไม่เก็บค่าลับ; runtime ต้องใช้ Cloudflare Variables/Secrets |

## Rate-limit matrix

- admin.login และ customer.login: 20 ครั้ง / 15 นาที / IP
- customer.register: 8 ครั้ง / ชั่วโมง / IP
- customer.password.forgot และ customer.password.reset.request: 5 ครั้ง / ชั่วโมง / IP เมื่อเปิดใช้ action
- checkout.stock.validate: 90 ครั้ง / ชั่วโมง / IP
- order.create: 25 ครั้ง / ชั่วโมง / IP
- Facebook webhook POST: 120 ครั้ง / นาที / IP

Redis ใช้ REDIS_REST_URL + REDIS_REST_TOKEN หรือ Upstash REDIS_URL ที่รองรับ REST; หาก Redis ล่ม limiter แบบ durable เดิมยังคุม action สำคัญอยู่

## Free-plan risk

บัญชีนี้ตั้งใจใช้ Cloudflare Workers Free 100%. Free มี CPU limit 10ms ต่อ request; dynamic Next SSR หรือ route ที่อ่าน storage เมื่อ cache miss อาจเกิน limit ได้. ห้ามใส่ limits.cpu_ms แบบแผนเสียเงิน. แนวทางที่รองรับ Free คือ cache-first/static shell, redirect รูป public ไป CDN และลดงานใน request แรก.

## ก่อน production sign-off

- [ ] รัน pnpm audit:source, pnpm typecheck, pnpm lint, pnpm test และ pnpm build ใน CI
- [ ] ตรวจ runtime DATABASE_URL, Redis REST และ storage โดยไม่แสดงค่าใน log
- [ ] ทำ staging soak และ penetration test: SQLi, XSS, IDOR, CSRF, mass assignment
- [ ] ให้ security owner ลงชื่อรับรอง

เจ้าของ sign-off: TODO — human security owner
วันที่ทบทวน: TODO — หลัง staging soak และตรวจ runtime secrets
