'use client';
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <html lang="th"><body><div style={{maxWidth:720,margin:'10vh auto',padding:32,fontFamily:'sans-serif'}}><h1>ระบบขัดข้องชั่วคราว</h1><p>เราเก็บรายละเอียดข้อผิดพลาดไว้เพื่อตรวจสอบแล้ว</p><button onClick={reset}>ลองอีกครั้ง</button></div></body></html>; }
