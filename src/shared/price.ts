/**
 * One way to write a price, for the whole shop.
 *
 * Eight files defined their own `formatPrice`, and they did not agree. Seven
 * returned a bare number and the quick-view modal appended " บาท", so the same
 * product read "1,010" on its card and "1,010 บาท" in the panel that opens
 * over the card. All of them called `toLocaleString('th-TH')` with no options,
 * which lets the runtime choose up to three decimal places — so a price that
 * is not a whole number renders with a different number of digits depending on
 * which screen a shopper is looking at.
 *
 * Prices are money. Showing the same amount two ways on two screens is the
 * kind of small inconsistency that makes somebody check whether they are being
 * charged what they were quoted.
 *
 * The rule here: Thai digit grouping, no decimals when the amount is whole,
 * two when it is not, and never three. The unit is a separate function so a
 * caller decides whether "บาท" belongs in that spot, rather than discovering
 * that the helper had an opinion.
 */

const FORMATTER = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** `1010` becomes "1,010"; `1010.5` becomes "1,010.5". */
export function formatPrice(value: unknown): string {
  const amount = Number(value ?? 0);
  return FORMATTER.format(Number.isFinite(amount) ? amount : 0);
}

/** The same number with the unit, for places that show it on its own. */
export function formatPriceWithUnit(value: unknown): string {
  return `${formatPrice(value)} บาท`;
}
