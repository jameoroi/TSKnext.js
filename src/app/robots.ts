import type { MetadataRoute } from 'next';
import { requestOrigin } from '@/server/public-legacy-cache';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = (await requestOrigin()).replace(/\/$/, '');
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin/', '/account', '/checkout', '/login', '/owner', '/operations/', '/supplier/', '/agent/settings'],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
