import 'server-only';

import { type CarouselSlide, slidesFromBanners } from '@/components/content/banner-slides';
import { getSiteSettings } from '@/server/catalog';

export type PageBannerKey = 'products' | 'brands' | 'partners' | 'contact';

/**
 * The pictures set in ตั้งค่าเว็บไซต์ → แบนเนอร์หน้าเว็บ for one storefront page.
 * Read from the same cached settings payload every page already loads; an empty
 * list keeps the page's own theme background.
 */
export async function getPageBanners(page: PageBannerKey): Promise<CarouselSlide[]> {
  try {
    const site = await getSiteSettings();
    return slidesFromBanners(site[`page_banners_${page}`]);
  } catch {
    return [];
  }
}
