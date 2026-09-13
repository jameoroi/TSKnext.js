export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[55vh] max-w-3xl items-center justify-center px-6 py-16 text-center">
      <div className="rounded-3xl border border-emerald-100 bg-white p-10 shadow-sm">
        <p className="text-sm font-semibold tracking-[0.18em] text-emerald-700">THAISERKIT SUPPLY</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">ขณะนี้ออฟไลน์</h1>
        <p className="mt-3 text-slate-600">ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต แล้วลองโหลดหน้านี้อีกครั้ง</p>
        <a
          className="mt-6 rounded-xl bg-emerald-700 px-5 py-3 font-semibold text-white"
          href="/"
        >
          ลองใหม่
        </a>
      </div>
    </main>
  );
}
