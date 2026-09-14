import type { MetadataRoute } from 'next';
import { requestOrigin, safePublicLegacy } from '@/server/public-legacy-cache';

const staticPaths = [
  '/',
  '/products',
  '/brands',
  '/about',
  '/news',
  '/videos',
  '/partners',
  '/contact',
  '/terms',
  '/privacy',
  '/returns',
  '/partner-register',
  '/kits',
];
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = (await requestOrigin()).replace(/\/$/, '');
  const data = await safePublicLegacy<any>('products.sitemap', {}, { products: [], shelves: [] });
  const out: MetadataRoute.Sitemap = staticPaths.map((path) => ({
    url: `${origin}${path}`,
    changeFrequency: path === '/' ? 'daily' : 'weekly',
    priority: path === '/' ? 1 : 0.7,
  }));
  const seen = new Set(out.map((x) => x.url));
  for (const p of data.products || []) {
    const id = String(p.slug || p.id || '').trim();
    if (!id) continue;
    const url = `${origin}/products/${encodeURIComponent(id)}`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
      changeFrequency: 'weekly',
      priority: 0.8,
    });
  }
  return out;
}
