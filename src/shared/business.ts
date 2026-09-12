/**
 * The one place the business describes itself.
 *
 * The shop's legal name, address, phone and hours used to be typed into the
 * footer, the contact page and the SEO descriptions separately, so they drifted
 * apart and a correction had to be made in several files. Every surface now
 * reads from here, and the values that differ per deployment come from the
 * environment.
 *
 * Registration numbers are deliberately blank by default. A Thai storefront is
 * expected to publish its DBD registration and tax id, but inventing one would
 * be worse than showing nothing, so each block only renders once its value is
 * configured.
 */

export type BusinessAddress = {
  street: string;
  locality: string;
  region: string;
  postalCode: string;
  country: string;
  countryCode: string;
};

export type BusinessProfile = {
  legalName: string;
  tradingName: string;
  tagline: string;
  description: string;
  /** DBD juristic person registration number (เลขทะเบียนนิติบุคคล). */
  registrationNumber: string;
  /** Tax id (เลขประจำตัวผู้เสียภาษีอากร). Usually the same 13 digits. */
  taxId: string;
  address: BusinessAddress;
  phone: string;
  email: string;
  openingHours: string;
  /** Machine-readable hours for structured data, e.g. "Mo-Sa 07:00-17:00". */
  openingHoursSpec: string;
  siteUrl: string;
  latitude: string;
  longitude: string;
};

const DEFAULTS: BusinessProfile = {
  legalName: 'บริษัท ไทยเซอร์กิจ ซัพพลาย จำกัด',
  tradingName: 'THAISERKIT SUPPLY',
  tagline: 'เครื่องมือช่างและอุปกรณ์การเกษตร',
  description:
    'ศูนย์รวมเครื่องมือช่าง เครื่องมือไฟฟ้า ปั๊มน้ำ ปั๊มบาดาล ท่อ PE และอุปกรณ์การเกษตรคุณภาพ จำหน่ายทั้งหน้าร้านและออนไลน์ พร้อมจัดส่งทั่วประเทศ',
  registrationNumber: '',
  taxId: '',
  address: {
    street: '89 หมู่ 9 บ้านห้วยบง ต.น้ำแวน',
    locality: 'อ.เชียงคำ',
    region: 'จ.พะเยา',
    postalCode: '56110',
    country: 'ประเทศไทย',
    countryCode: 'TH',
  },
  phone: '088-2608042',
  email: 'thaiserkit.supply@gmail.com',
  openingHours: 'จันทร์ – เสาร์ 07.00 – 17.00 น.',
  openingHoursSpec: 'Mo-Sa 07:00-17:00',
  siteUrl: 'https://jayxtsk.shop',
  latitude: '',
  longitude: '',
};

/** Full postal address on one line, the way it is printed on documents. */
export function formatAddress(address: BusinessAddress) {
  return `${address.street} ${address.locality} ${address.region} ${address.postalCode}`;
}

/** Digits only, for `tel:` links. */
export function telHref(phone: string) {
  return `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;
}

/**
 * Merges the deployment's environment over the defaults. Blank environment
 * values are ignored so an unset variable never erases a good default.
 */
export function buildBusinessProfile(env: Record<string, unknown> = {}): BusinessProfile {
  const pick = (key: string, fallback: string) => {
    const value = String(env[key] ?? '').trim();
    return value || fallback;
  };
  return {
    legalName: pick('businessLegalName', DEFAULTS.legalName),
    tradingName: pick('businessTradingName', DEFAULTS.tradingName),
    tagline: pick('businessTagline', DEFAULTS.tagline),
    description: pick('businessDescription', DEFAULTS.description),
    registrationNumber: pick('businessRegistrationNumber', DEFAULTS.registrationNumber),
    taxId: pick('businessTaxId', DEFAULTS.taxId),
    address: {
      street: pick('businessStreet', DEFAULTS.address.street),
      locality: pick('businessLocality', DEFAULTS.address.locality),
      region: pick('businessRegion', DEFAULTS.address.region),
      postalCode: pick('businessPostalCode', DEFAULTS.address.postalCode),
      country: DEFAULTS.address.country,
      countryCode: DEFAULTS.address.countryCode,
    },
    phone: pick('contactPhone', DEFAULTS.phone),
    email: pick('businessEmail', DEFAULTS.email),
    openingHours: pick('businessOpeningHours', DEFAULTS.openingHours),
    openingHoursSpec: pick('businessOpeningHoursSpec', DEFAULTS.openingHoursSpec),
    siteUrl: String(env.siteUrl ?? '').trim() || DEFAULTS.siteUrl,
    latitude: pick('businessLatitude', DEFAULTS.latitude),
    longitude: pick('businessLongitude', DEFAULTS.longitude),
  };
}

export const BUSINESS_DEFAULTS = DEFAULTS;
