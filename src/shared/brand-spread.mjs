/**
 * Take one product from each brand in turn until the shelf is full.
 *
 * The home page asked `products.list` for `featured: 1` and had been getting
 * whatever the first twelve products happened to be, because that parameter
 * does not exist and never has — measured against the live API on 2026-09-03,
 * `?featured=1&per_page=12` and `?per_page=12` return the same twelve rows.
 * Those twelve came from four brands, so a shelf headed "สินค้าแนะนำ" showed
 * four of the shop's brands and never Milwaukee, Bosch or Stanley.
 *
 * Fixing the filter alone would have been worse: exactly one product in a
 * catalogue of 1,016 carries the `home_featured` flag, so an honest filter
 * leaves a shelf of one.
 *
 * So the request asks for a wider slice and this picks across it, brand by
 * brand. It lives here rather than inside the composable so that the test can
 * import the same function the shop runs, instead of a copy of it.
 */

/** What a product with no brand is filed under, so it is kept rather than lost. */
const UNBRANDED = 'อื่น ๆ';

export function spreadByBrand(products, limit) {
  const byBrand = new Map();
  const order = [];
  for (const product of products || []) {
    const brand = String(product?.brand || '').trim() || UNBRANDED;
    if (!byBrand.has(brand)) { byBrand.set(brand, []); order.push(brand); }
    byBrand.get(brand).push(product);
  }

  const picked = [];
  // Round after round: everyone's first product, then everyone's second, so a
  // brand with one item is on the shelf before a brand with twenty gets a
  // second slot.
  for (let round = 0; picked.length < limit; round++) {
    let addedThisRound = false;
    for (const brand of order) {
      const product = byBrand.get(brand)[round];
      if (!product) continue;
      picked.push(product);
      addedThisRound = true;
      if (picked.length >= limit) break;
    }
    if (!addedThisRound) break;
  }
  return picked;
}
