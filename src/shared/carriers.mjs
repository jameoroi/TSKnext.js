/**
 * The couriers this shop ships with, and where a customer follows a parcel.
 *
 * The carrier was a free-text box, so it was spelled differently every time —
 * "Flash", "flash express", "แฟลช" — which meant nothing downstream could ever
 * turn it into a tracking link. It is a fixed list now, stored by `id`, and the
 * customer's order page turns that id into a button.
 *
 * Only Thailand Post accepts the number in the URL. The others land on their
 * own tracking page where it has to be pasted, so the customer page offers a
 * copy button next to the link rather than pretending a deep link exists.
 */

/**
 * @typedef {object} Carrier
 * @property {string} id stored on the order; never change one once used
 * @property {string} name shown to staff and customers
 * @property {string} track the courier's tracking page
 * @property {(n: string) => string} [deepLink] when the number can go in the URL
 */

/** @type {Carrier[]} */
export const CARRIERS = [
  { id: 'kerry', name: 'Kerry Express', track: 'https://th.kex-express.com/th/track/' },
  { id: 'flash', name: 'Flash Express', track: 'https://www.flashexpress.co.th/fle/tracking' },
  { id: 'jt', name: 'J&T Express', track: 'https://www.jtexpress.co.th/service/track' },
  { id: 'best', name: 'BEST Express', track: 'https://www.best-inc.co.th/track' },
  {
    id: 'thaipost',
    name: 'ไปรษณีย์ไทย',
    track: 'https://track.thailandpost.com/',
    deepLink: (number) => `https://track.thailandpost.com/?trackNumber=${encodeURIComponent(number)}`,
  },
];

/**
 * Finds a carrier by its stored id, tolerating the free-text values already on
 * older orders — "J&T", "flash express" and "ไปรษณีย์ไทย" all still resolve.
 *
 * @param {unknown} value
 * @returns {Carrier | null}
 */
export function findCarrier(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  const byId = CARRIERS.find((carrier) => carrier.id === raw);
  if (byId) return byId;
  return CARRIERS.find((carrier) => {
    const name = carrier.name.toLowerCase();
    return name === raw || raw.includes(carrier.id) || raw.includes(name) || name.includes(raw);
  }) || null;
}

/** The best URL for this parcel: deep link where one exists, else the page. */
export function trackingUrl(carrierValue, trackingNumber) {
  const carrier = findCarrier(carrierValue);
  if (!carrier) return '';
  const number = String(trackingNumber || '').trim();
  return number && carrier.deepLink ? carrier.deepLink(number) : carrier.track;
}

/** True when the number still has to be pasted on the courier's page. */
export function needsPaste(carrierValue) {
  const carrier = findCarrier(carrierValue);
  return Boolean(carrier && !carrier.deepLink);
}

/** What to show for a stored value, including one typed before the list existed. */
export function carrierName(value) {
  return findCarrier(value)?.name || String(value || '').trim();
}
