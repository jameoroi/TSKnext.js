/* =========================================================================
   THAISERKIT SUPPLY — API CONFIG
   -------------------------------------------------------------------------
   ไฟล์นี้คือจุดเดียวที่ต้องแก้เพื่อเชื่อมต่อ API จริง กรอกค่าให้ครบแล้วเปลี่ยน
   useLiveData เป็น true — ไม่ต้องแตะไฟล์อื่นเลย (app.js จะอ่านค่าจากไฟล์นี้เอง)

   ⚠️ สำคัญเรื่องความปลอดภัย:
   โค้ดในไฟล์นี้ทำงานฝั่ง "เบราว์เซอร์ผู้ใช้" (client-side) ถ้าใส่ API key ตรงนี้
   ใครก็ตามที่เปิด DevTools ของเบราว์เซอร์จะเห็น key ได้ทันที และ API ปลายทาง
   อาจปฏิเสธ request เพราะติด CORS (ระบบส่วนใหญ่ที่ต้อง login ไม่อนุญาตให้เบราว์เซอร์
   ของคนอื่นเรียกตรง ๆ) วิธีที่ถูกต้องและปลอดภัยกว่าคือทำ "proxy" เล็ก ๆ ฝั่งเซิร์ฟเวอร์
   ของคุณเอง (เช่น ไฟล์ PHP/Node 1 ไฟล์บนโฮสติ้งที่คุณมีอยู่แล้ว) ให้เซิร์ฟเวอร์เป็นคน
   ถือ API key แล้วให้เว็บนี้เรียก proxy ของคุณแทน — ดูตัวอย่างท้ายไฟล์นี้
========================================================================= */

const API_CONFIG = {
  // ตั้งเป็น true เมื่อกรอกค่าด้านล่างครบและทดสอบแล้วว่าเรียกได้จริง
  useLiveData: false,

  // เครื่องมือวิเคราะห์จะไม่โหลดจนกว่าผู้ใช้จะกดยินยอมในแถบ PDPA
  // ใส่เฉพาะ Public ID/DSN เท่านั้น ห้ามใส่ Secret หรือ API key ฝั่งเซิร์ฟเวอร์ในไฟล์นี้
  privacy: {
    ga4MeasurementId: "",
    sentryDsn: ""
  },

  // ---------------- แชท Facebook Messenger ----------------
  // มี 2 วิธีให้เลือก ใช้วิธีไหนก็ได้ (หรือทั้งคู่พร้อมกันก็ได้):
  //
  // วิธีที่ 1 (ง่ายสุด ไม่ต้องสมัครอะไรเพิ่ม) — ใส่แค่ pageUsernameOrId ปุ่มลอยมุมขวาล่าง
  //   จะพาไปเปิดหน้าแชท m.me/ชื่อเพจ ทันที ใช้ได้ทั้งมือถือและคอม
  //
  // วิธีที่ 2 (แนะนำ — ของจริงจาก Facebook, กล่องแชทฝังในหน้าเว็บเลย ไม่ต้องออกจากเว็บ)
  //   คือปลั๊กอิน "Facebook Customer Chat" ของ Meta ซึ่งเป็นการเชื่อมต่อ Messenger Platform
  //   API ตัวจริง (ลูกค้าคุยในกล่องแชทบนเว็บ ข้อความจะเข้ากล่องข้อความเพจ Facebook ของร้าน
  //   ทันที ตอบกลับจากแอป Facebook/Meta Business Suite ได้เหมือนแชทปกติ) ต้องตั้งค่า 3 อย่าง:
  //     1) appId  — สร้างแอปที่ https://developers.facebook.com/apps -> "Create App" ->
  //        เลือกประเภท "Business" -> จะได้ App ID (ตัวเลข) มา ใส่ในช่อง appId ด้านล่าง
  //     2) pageId — Page ID ตัวเลขของเพจร้านคุณ (ดูได้ที่ เพจ -> เกี่ยวกับ -> "Page ID"
  //        หรือ facebook.com/YOURPAGE/about) ใส่ในช่อง pageId ด้านล่าง
  //     3) ไปที่แอปที่สร้าง -> เมนู "Messenger" ทางซ้าย -> "Settings" -> เปิดใช้งาน
  //        "Customer Chat Plugin" -> เลือกเพจร้านคุณ -> ในขั้นตอนนี้ Facebook จะให้ใส่
  //        "Whitelisted Domains" ให้ใส่โดเมนเว็บของร้าน (เช่น https://thaiserkit.supply)
  //        มิฉะนั้นกล่องแชทจะไม่ขึ้นเมื่อเอาเว็บขึ้นโฮสติ้งจริง
  //   กรอกครบทั้ง appId และ pageId แล้วเว็บจะโหลด SDK ของ Facebook อัตโนมัติและแสดงกล่อง
  //   แชทมุมขวาล่างแทนปุ่ม m.me (ถ้ากรอกแค่ pageUsernameOrId อย่างเดียว จะใช้วิธีที่ 1 แทน)
  facebook: {
    // วิธีที่ 1: "ชื่อผู้ใช้เพจ" หรือ Page ID เช่น "thaiserkit.supply"
    // ดูได้จาก URL เพจ เช่น facebook.com/thaiserkit.supply -> ใส่ "thaiserkit.supply"
    pageUsernameOrId: "",

    // วิธีที่ 2 (Customer Chat Plugin ของจริง) — กรอกทั้งสองช่องนี้เพื่อเปิดใช้งาน
    appId: "",
    pageId: "",

    // ข้อความทักทายที่จะโชว์เมื่อลูกค้าเปิดกล่องแชทครั้งแรก (ใช้กับวิธีที่ 2 เท่านั้น)
    greetingText: "สวัสดีค่ะ 👋 มีอะไรให้ช่วยสอบถามเกี่ยวกับสินค้าได้เลยนะคะ",
    // ภาษาของปลั๊กอิน (th_TH = ไทย, en_US = อังกฤษ)
    locale: "th_TH"
  },

  // ---------------- แจ้งเตือนออเดอร์ใหม่/ข้อความติดต่อ ผ่าน Telegram ----------------
  // ใช้งานได้ทันทีแม้ยังไม่มี hosting/เซิร์ฟเวอร์ — พอลูกค้ากด "ยืนยันคำสั่งซื้อ" หรือ
  // ส่งฟอร์ม "ติดต่อเรา" เว็บจะยิงข้อความแจ้งเตือนเข้า Telegram ให้ทันที
  // วิธีตั้งค่า (ทำครั้งเดียว ใช้เวลาไม่ถึง 5 นาที ไม่มีค่าใช้จ่าย):
  //   1) เปิดแอป Telegram -> ค้นหา "BotFather" -> พิมพ์ /newbot แล้วตั้งชื่อบอทตามที่ถาม
  //      เสร็จแล้ว BotFather จะให้ "token" มาเป็นข้อความยาวๆ (หน้าตาคล้าย 123456:ABC-xxxx)
  //      เอามาใส่ botToken ด้านล่าง
  //   2) เริ่มแชทกับบอทของคุณเอง (กด Start/พิมพ์อะไรก็ได้ 1 ข้อความ)
  //   3) เปิดลิงก์นี้ในเบราว์เซอร์ (แทนที่ <TOKEN> ด้วย token จากข้อ 1):
  //      https://api.telegram.org/bot<TOKEN>/getUpdates
  //      จะเจอตัวเลข "chat":{"id": xxxxxxxxx  <- เลขนี้แหละคือ chatId เอามาใส่ด้านล่าง
  //   (ถ้าอยากให้ทีมงานหลายคนเห็นแจ้งเตือน สร้างกลุ่ม Telegram แล้วเชิญบอทเข้ากลุ่มแทนได้
  //    วิธีหา chatId ของกลุ่มก็ทำแบบเดียวกัน แค่ต้องส่งข้อความในกลุ่มก่อนค่อยเปิดลิงก์ getUpdates)
  // Production: Telegram credentials live only in Cloudflare Pages environment variables.
  telegram: {},

  // ---------------- รับชำระเงินผ่าน PromptPay QR (ไม่ต้องมี payment gateway/hosting) ----------------
  // สร้าง QR พร้อมเพย์จริงให้ลูกค้าสแกนจ่ายที่หน้า checkout ได้ทันที — เป็น QR แบบสแตติก
  // (เข้ารหัสเลขบัญชี+ยอดเงินไว้ในรูป ไม่ได้เชื่อมต่อระบบธนาคารจริง) ลูกค้าโอนแล้วต้อง
  // แนบสลิปมาให้ตรวจสอบเอง (ระบบจะส่งสลิปเข้า Telegram ให้อัตโนมัติถ้าตั้งค่าไว้ด้านบน)
  promptpay: {
    // เบอร์มือถือ 10 หลักที่ผูกพร้อมเพย์ไว้ (เช่น "0812345678") หรือเลขบัตรประชาชน/
    // เลขผู้เสียภาษี 13 หลัก ของร้าน — ต้องเป็นเบอร์/เลขที่ "ผูกพร้อมเพย์" กับธนาคารแล้วเท่านั้น
    id: "",
    merchantName: "THAISERKIT SUPPLY",
    merchantCity: "PHAYAO"
  },

  // ---------------- สินค้า: Nex Gen Commerce ----------------
  nexgen: {
    // URL ฐานของ API เช่น "https://nexgencommerce.one.th/api/v1"
    // (หรือถ้าทำ proxy เอง ให้ใส่ URL ของ proxy ตัวเอง เช่น "/api/proxy/nexgen")
    baseUrl: "",
    // path สำหรับดึงรายการสินค้าของร้าน ต่อท้าย baseUrl เช่น "/shop/{shopId}/products"
    productsEndpoint: "",
    // วิธียืนยันตัวตน — ปรับชื่อ header ให้ตรงกับที่ API กำหนด
    apiKeyHeader: "Authorization",   // เช่น "Authorization" หรือ "x-api-key"
    apiKeyPrefix: "Bearer ",         // เช่น "Bearer " หรือปล่อยว่าง "" ถ้าไม่ต้องมีคำนำหน้า
    apiKey: ""
  },

  // ---------------- แบนเนอร์: URBRAND ----------------
  urbrand: {
    baseUrl: "",                     // เช่น "https://manageurbrand.one.th/api"
    bannersEndpoint: "",              // path ดึงแบนเนอร์ เช่น "/information/banners"
    apiKeyHeader: "Authorization",
    apiKeyPrefix: "Bearer ",
    apiKey: ""
  },

  // ---------------- เชื่อมต่อร้านค้า: Shopee Open Platform ----------------
  // ⚠️ ต้องสมัครเป็น Partner ที่ https://open.shopee.com ก่อน (ใช้เวลาตรวจสอบ)
  // จะได้ Partner ID + Partner Key มา "ห้ามใส่ Partner Key ในไฟล์นี้เด็ดขาด"
  // เพราะไฟล์นี้รันบนเบราว์เซอร์ลูกค้า — ให้ใส่ Partner Key ไว้ในไฟล์ proxy บนเซิร์ฟเวอร์แทน
  // (ดูตัวอย่างที่ /server-proxy-examples/shopee/)
  shopee: {
    // URL ของ proxy บนเซิร์ฟเวอร์คุณเอง เช่น "https://yourdomain.com/api/proxy/shopee"
    baseUrl: "",
    // path เริ่ม OAuth ให้แอดมินกดปุ่มแล้วพาไปอนุญาตสิทธิ์ที่ shopee.co.th เช่น "/auth-url.php"
    authUrlEndpoint: "",
    // path รับข้อมูลสถานะร้านหลังเชื่อมต่อสำเร็จ เช่น "/shop-info.php"
    shopInfoEndpoint: "",
    // path ดึงสต๊อก/ราคาสินค้าชิ้นเดียว ใส่ {itemId} ให้ระบบแทนที่อัตโนมัติ
    stockEndpoint: "/stock.php?item_id={itemId}",
    // path ดึงสินค้าทั้งร้าน (ใช้ตอนนำเข้าสินค้าจาก Shopee เข้าระบบ)
    productListEndpoint: "/products.php"
  },

  // ---------------- เชื่อมต่อร้านค้า: Lazada Open Platform ----------------
  // ⚠️ ต้องสมัครเป็น Developer/Partner ที่ https://open.lazada.com ก่อน
  // จะได้ App Key + App Secret มา "ห้ามใส่ App Secret ในไฟล์นี้เด็ดขาด" ด้วยเหตุผลเดียวกับ Shopee
  lazada: {
    baseUrl: "",                      // URL ของ proxy บนเซิร์ฟเวอร์คุณเอง
    authUrlEndpoint: "",              // path เริ่ม OAuth เช่น "/auth-url.php"
    shopInfoEndpoint: "",             // path ดึงสถานะร้านหลังเชื่อมต่อ เช่น "/shop-info.php"
    stockEndpoint: "/stock.php?item_id={itemId}",
    productListEndpoint: "/products.php"
  }
};

/* =========================================================================
   ตัวอย่าง proxy ฝั่งเซิร์ฟเวอร์ (แนะนำให้ทำแบบนี้แทนการยิง API ตรงจากเบราว์เซอร์)
   -------------------------------------------------------------------------
   ถ้าโฮสติ้งของคุณรองรับ PHP ให้สร้างไฟล์ /api/proxy/nexgen.php บนเซิร์ฟเวอร์คุณ:

   <?php
   header('Content-Type: application/json');
   $ch = curl_init("https://nexgencommerce.one.th/api/v1/shop/XXXX/products");
   curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
   curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer YOUR_REAL_KEY_HERE"]);
   echo curl_exec($ch);
   curl_close($ch);

   แล้วตั้งค่าด้านบนเป็น:
   nexgen.baseUrl = "/api/proxy" , nexgen.productsEndpoint = "/nexgen.php"
   nexgen.apiKey = ""  (ไม่ต้องใส่ เพราะ key อยู่ในไฟล์ PHP บนเซิร์ฟเวอร์แล้ว ปลอดภัยกว่า)
========================================================================= */

/* =========================================================================
   วิธีเปิดใช้งาน "เชื่อมต่อ Shopee / Lazada" ในแท็บแอดมิน (ทำ 3 ขั้นตอน)
   -------------------------------------------------------------------------
   ทำไมทำในเบราว์เซอร์อย่างเดียวไม่ได้: Shopee/Lazada กำหนดให้ทุก request ต้องเซ็น
   signature ด้วย Partner Key/App Secret ที่เป็นความลับ — ถ้าใส่ในโค้ดเว็บ (JS)
   ใครก็เปิดดูใน DevTools แล้วขโมยไปยิง API แทนร้านคุณได้ทันที ทาง Shopee/Lazada
   เองก็บล็อกการเรียกตรงจากเบราว์เซอร์อยู่แล้ว (CORS) จึงต้องมีเซิร์ฟเวอร์เล็ก ๆ
   1 ตัวถือกุญแจไว้แทน (เรียกว่า "proxy")

   ขั้นตอนที่ 1 — สมัครเป็นนักพัฒนา/พาร์ทเนอร์ (ทำนอกเว็บนี้ ที่เว็บ Shopee/Lazada เอง)
     Shopee: https://open.shopee.com  -> สร้างแอป -> ได้ Partner ID + Partner Key
     Lazada: https://open.lazada.com -> สร้างแอป -> ได้ App Key + App Secret
     (ทั้งสองเจ้าต้องรอทีมตรวจสอบอนุมัติแอปก่อน ปกติใช้เวลาไม่กี่วันถึงไม่กี่สัปดาห์
     แล้วแต่นโยบายล่าสุดของแต่ละแพลตฟอร์ม)

   ขั้นตอนที่ 2 — อัปโหลดไฟล์ proxy ตัวอย่างที่แนบไปให้ (โฟลเดอร์ server-proxy-examples/)
     ขึ้นไปบนโฮสติ้งที่รองรับ PHP ของคุณ (โฟลเดอร์เดียวกับเว็บนี้ก็ได้) แล้วเปิดไฟล์
     server-proxy-examples/shopee/config.php และ server-proxy-examples/lazada/config.php
     ใส่ Partner ID/Key หรือ App Key/Secret ที่ได้จากขั้นตอนที่ 1 ลงไป (ไฟล์นี้อยู่บน
     เซิร์ฟเวอร์เท่านั้น เบราว์เซอร์ลูกค้าเข้าไม่ถึง จึงปลอดภัย)

   ขั้นตอนที่ 3 — กลับมาที่ไฟล์นี้ (config.js) แล้วใส่ URL ของ proxy ที่อัปโหลดไป เช่น
     shopee.baseUrl = "https://yourdomain.com/server-proxy-examples/shopee"
     lazada.baseUrl = "https://yourdomain.com/server-proxy-examples/lazada"
     บันทึกไฟล์ แล้วรีเฟรชหน้าแอดมิน -> แท็บ "เชื่อมต่อร้านค้า" -> กดปุ่ม "เชื่อมต่อ Shopee/Lazada"
     ระบบจะพาไปหน้ายืนยันสิทธิ์ของ Shopee/Lazada จริง เมื่อกดอนุญาตแล้วจะเด้งกลับมาที่นี่
     พร้อมสถานะ "เชื่อมต่อแล้ว" ให้จับคู่สินค้าและซิงก์สต๊อกได้ทันที

   ก่อนทำครบ 3 ขั้นตอนนี้ ปุ่ม "เชื่อมต่อ" ในแท็บแอดมินจะแจ้งเตือนว่ายังตั้งค่าไม่ครบ
   (กันไม่ให้กดแล้วพังเพราะยังไม่มี proxy จริงรองรับ)
========================================================================= */
