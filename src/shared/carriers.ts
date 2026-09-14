export type Carrier = { id: string; name: string; track: string; deepLink?: (number: string) => string };

export const CARRIERS: Carrier[] = [
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

export function findCarrier(value: unknown) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw) return null;
  const byId = CARRIERS.find((carrier) => carrier.id === raw);
  if (byId) return byId;
  return (
    CARRIERS.find((carrier) => {
      const name = carrier.name.toLowerCase();
      return name === raw || raw.includes(carrier.id) || raw.includes(name) || name.includes(raw);
    }) || null
  );
}

export function trackingUrl(carrierValue: unknown, trackingNumber: unknown) {
  const carrier = findCarrier(carrierValue);
  if (!carrier) return '';
  const number = String(trackingNumber || '').trim();
  return number && carrier.deepLink ? carrier.deepLink(number) : carrier.track;
}

export function needsPaste(carrierValue: unknown) {
  return Boolean(findCarrier(carrierValue) && !findCarrier(carrierValue)?.deepLink);
}
export function carrierName(value: unknown) {
  return findCarrier(value)?.name || String(value || '').trim();
}
