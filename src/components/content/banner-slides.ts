export type CarouselSlide = { src: string; href?: string; alt?: string };

/** Admin banner rows ({ img, link_url, alt_text, active }) as carousel slides, active ones only. */
export function slidesFromBanners(rows: unknown, fallbackHref = ''): CarouselSlide[] {
  return (Array.isArray(rows) ? rows : [])
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .filter((row) => row.active !== false)
    .map((row) => ({
      src: String(row.img || row.image_url || row.image || '').trim(),
      href: String(row.link_url || row.link || row.url || fallbackHref || '').trim(),
      alt: String(row.alt_text || row.alt || row.title || ''),
    }))
    .filter((slide) => slide.src);
}
