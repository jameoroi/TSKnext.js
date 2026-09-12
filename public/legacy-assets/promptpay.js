/* =========================================================================
   THAISERKIT SUPPLY — PromptPay QR generator (ฝั่งเบราว์เซอร์ล้วนๆ ไม่ต้องมีเซิร์ฟเวอร์)
   -------------------------------------------------------------------------
   สร้าง payload ตามมาตรฐาน EMV QR Code for Payment Systems ที่ธนาคารไทยใช้ (พร้อมเพย์)
   แล้วเอาไปวาดเป็น QR code ให้ลูกค้าสแกนจ่ายผ่านแอปธนาคารได้ทันที — ไม่ต้องขอ
   API key หรือสมัคร payment gateway ใดๆ เพราะพร้อมเพย์ QR แบบสแตติกนี้เป็นแค่
   "เลขบัญชี+ยอดเงิน" เข้ารหัสอยู่ในรูป QR ธรรมดา ไม่ใช่การเชื่อมต่อระบบจ่ายเงินจริง
   ⚠️ ข้อควรรู้: เป็น "จ่ายแล้วต้องตรวจสลิปเอง" (manual verification) ไม่ใช่ระบบ
   ยืนยันการจ่ายเงินอัตโนมัติ — ถ้าต้องการให้ระบบเช็คว่าลูกค้าโอนจริงและตัดสต็อก/
   ยืนยันออเดอร์ให้อัตโนมัติ ต้องต่อ API ธนาคารหรือ payment gateway ผ่านเซิร์ฟเวอร์จริง
========================================================================= */

function crc16ccitt(str){
  let crc = 0xFFFF;
  for(let i=0;i<str.length;i++){
    crc ^= (str.charCodeAt(i) << 8);
    for(let j=0;j<8;j++){
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4,"0");
}
function ppTlv(id, value){ return id + String(value.length).padStart(2,"0") + value; }

/* รับเบอร์มือถือ 10 หลัก (เช่น 0812345678) หรือเลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก */
function formatPromptPayId(raw){
  const digits = String(raw||"").replace(/[^0-9]/g,"");
  if(digits.length === 10) return "0066" + digits.substring(1); // เบอร์มือถือ -> 0066 + ตัดเลข 0 หน้าออก
  return digits; // 13 หลัก (บัตรประชาชน/เลขผู้เสียภาษี) ใช้ตรงๆ
}

/* amount เป็นตัวเลข (บาท) หรือ null/undefined ถ้าไม่ต้องการฝังยอดเงิน (ให้ลูกค้ากรอกเองในแอป) */
function buildPromptPayPayload(promptpayId, amount, merchantName, merchantCity){
  const id = formatPromptPayId(promptpayId);
  if(!id) return null;
  const subId = id.length === 13 && id.startsWith("0066") ? "01" : "02"; // 01=เบอร์มือถือ, 02=บัตรประชาชน/เลขผู้เสียภาษี
  const merchantInfo = ppTlv("00","A000000677010111") + ppTlv(subId, id);
  // Keep the field order used by promptpay-qr on the server:
  // country (58), currency (53), then the optional amount (54).
  let payload = ppTlv("00","01") + ppTlv("01", amount ? "12" : "11") + ppTlv("29", merchantInfo) + ppTlv("58","TH") + ppTlv("53","764");
  if(amount) payload += ppTlv("54", Number(amount).toFixed(2));
  if(merchantName) payload += ppTlv("59", String(merchantName).substring(0,25));
  if(merchantCity) payload += ppTlv("60", String(merchantCity).substring(0,15));
  payload += "6304";
  payload += crc16ccitt(payload);
  return payload;
}

/* วาด QR ลงใน element ที่ระบุ — ต้องโหลดไลบรารี qrcode-generator (assets/vendor หรือ CDN) ก่อนเรียกใช้ */
function renderPromptPayQR(el, payload){
  if(!el || !payload) return;
  if(typeof qrcode !== "function"){
    el.innerHTML = `<p style="font-size:12px;color:#b3261e;">โหลดไลบรารี QR ไม่สำเร็จ (เช็คอินเทอร์เน็ต)</p>`;
    return;
  }
  const qr = qrcode(0, "M");
  qr.addData(payload);
  qr.make();
  el.innerHTML = qr.createSvgTag({ cellSize:4, margin:2 });
}

/*
   สร้าง QR เป็น data URL ในเบราว์เซอร์โดยตรง
   ใช้เป็นเส้นทางหลักของหน้า checkout/admin เพื่อไม่ให้การสร้างรูปภาพ PNG
   ขึ้นกับ runtime ของ serverless function แต่ยังคงใช้ payload มาตรฐานเดียวกัน
*/
function createPromptPayQrDataUrl(promptpayId, amount, merchantName){
  const normalizedId = String(promptpayId || '').replace(/[^0-9]/g, '');
  if(![10,13,15].includes(normalizedId.length)) throw new Error('promptpay_invalid_id');
  const numericAmount = amount === undefined || amount === null || amount === ''
    ? null
    : Number(amount);
  if(numericAmount !== null && (!Number.isFinite(numericAmount) || numericAmount <= 0)){
    throw new Error('invalid_amount');
  }
  // Keep the payload identical to the server generator. The account name is
  // shown beside the QR; omitting Thai text from the EMV payload also avoids
  // character-length mismatches in older bank apps.
  const payload = buildPromptPayPayload(normalizedId, numericAmount);
  if(!payload) throw new Error('promptpay_invalid_id');
  if(typeof qrcode !== 'function') throw new Error('qr_library_unavailable');

  const qr = qrcode(0, 'M');
  qr.addData(payload);
  qr.make();
  const qrDataUrl = typeof qr.createDataURL === 'function'
    ? qr.createDataURL(5, 2)
    : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.createSvgTag({cellSize:5, margin:2}))}`;
  return { qr_data_url: qrDataUrl, payload, promptpay_id: String(promptpayId || '').trim(), promptpay_name: merchantName || '', amount: numericAmount };
}

window.tskPromptPayQrLocal = createPromptPayQrDataUrl;
