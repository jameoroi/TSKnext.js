/**
 * The address of a product page.
 *
 * Every product in this catalogue arrived from an import, so its id is a hash
 * of the source row — `source-0018396e35eb860583f8afc6a6c62622`. A thousand
 * product URLs built from those ids carry no words at all: not for a search
 * engine deciding what the page is about, and not for a person looking at a
 * result and deciding whether to click it.
 *
 * The same records already carry a slug made from the product name
 * ("milwaukee-บล็อกกระแทก-ไร้สาย-18v-รุ่น-m18-fhiwf12-0x-…"), which was written
 * at import time and then never used for anything. This is the one place that
 * decides which of the two goes in a link, so the shop cannot end up publishing
 * both for the same product and splitting its own ranking between them.
 *
 * `products.get` accepts either, so an old hash URL somebody has bookmarked or
 * a search engine has already indexed keeps working; the page then points its
 * canonical link at the slug, which is how the two are consolidated into one.
 */
export function productPath(product: { id?: unknown; slug?: unknown } | null | undefined): string {
  const slug = String((product as any)?.slug || '').trim();
  const id = String((product as any)?.id || '').trim();
  // A slug is only useful if it survived being made — an import from a
  // title of pure punctuation can produce an empty one, and a product whose
  // name is a single character produces one too short to mean anything.
  const usable = slug.length >= 3 ? slug : id;
  return usable ? `/products/${encodeURIComponent(usable)}` : '/products';
}
