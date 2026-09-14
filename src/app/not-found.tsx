import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-28 text-center">
      <p className="text-sm font-bold text-rose-600">404</p>
      <h1 className="mt-2 text-4xl font-bold">ไม่พบหน้าที่ต้องการ</h1>
      <p className="mt-4 text-slate-500">ลิงก์อาจถูกย้ายหรือไม่มีอยู่ในระบบ</p>
      <Link
        href="/"
        className="mt-8 inline-flex rounded-xl bg-emerald-950 px-6 py-3 font-semibold text-white"
      >
        กลับหน้าหลัก
      </Link>
    </div>
  );
}
