import Link from 'next/link';
export function PageHero({
  title,
  subtitle,
  eyebrow = 'THAISERKIT SUPPLY',
  action,
  imageUrl,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: { label: string; href: string };
  imageUrl?: string;
}) {
  return (
    <section className="site-page-hero text-white">
      {imageUrl ? (
        // รูป hero ต้องมาจาก CMS/หลังบ้านเท่านั้น — ไม่ใส่ fallback จาก source code
        // biome-ignore lint/performance/noImgElement: CMS stores arbitrary CDN/data URLs
        <img className="site-page-hero__media" src={imageUrl} alt="" aria-hidden="true" />
      ) : null}
      <div className="site-page-hero__inner">
        <nav className="page-breadcrumb text-emerald-100/75" aria-label="เส้นทางหน้า">
          <Link href="/">หน้าแรก</Link>
          <span aria-hidden="true">›</span>
          <span className="text-white/90">{title}</span>
        </nav>
        <p className="mt-5 text-xs font-bold tracking-[.22em] text-emerald-300">{eyebrow}</p>
        <h1 className="site-page-hero__title mt-2">{title}</h1>
        {subtitle && <p className="site-page-hero__subtitle">{subtitle}</p>}
        {action && (
          <Link
            href={action.href}
            className="mt-6 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-50"
          >
            {action.label}
          </Link>
        )}
      </div>
    </section>
  );
}
export function StaticSections({
  sections,
}: {
  sections: Array<{ title: string; body: string | string[] }>;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-10">
      {sections.map((s, i) => (
        <section key={`${s.title}-${i}`} className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">{s.title}</h2>
          {Array.isArray(s.body) ? (
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
              {s.body.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">{s.body}</p>
          )}
        </section>
      ))}
    </div>
  );
}
