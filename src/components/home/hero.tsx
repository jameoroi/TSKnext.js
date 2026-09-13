import Image from 'next/image';
import Link from 'next/link';

type Banner = { src: string; link: string; alt: string };

function pick(row: Record<string, unknown>): Banner | null {
  if (row?.active === false) return null;
  const src = String(row?.img || row?.image_url || row?.image || '');
  if (!src) return null;
  return {
    src,
    link: String(row?.link || row?.link_url || '/products'),
    alt: String(row?.alt || 'โปรโมชั่น THAISERKIT SUPPLY'),
  };
}

/** HERO — static banner. The old timer carousel was removed because a broken
 * slide/data state left an empty hero and made the product shelf appear stuck. */
export function Hero({ banners }: { banners: Array<Record<string, unknown>> }) {
  const slides = banners.map(pick).filter((b): b is Banner => b !== null);
  const item = slides[0] || { src: '/legacy-assets/banners/1.png', link: '/products', alt: 'โปรโมชั่น THAISERKIT SUPPLY' };

  return (
    <section
      className="mx-auto max-w-7xl px-4 pt-4 lg:px-6 lg:pt-6"
      aria-label="แบนเนอร์โปรโมชั่น"
    >
      <Link href={item.link} aria-label={item.alt} className="relative block aspect-[16/10] overflow-hidden rounded-3xl shadow-2xl sm:aspect-[16/8] lg:aspect-[16/6]">
        <Image src={item.src} alt={item.alt} fill priority className="object-cover" unoptimized={item.src.startsWith('data:')} />
      </Link>
    </section>
  );
}
