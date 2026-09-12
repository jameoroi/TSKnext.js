import { getSiteSettings, type SiteSettings } from '@/server/catalog';
import { requestOrigin } from '@/server/public-legacy-cache';
import { buildBusinessProfile } from '@/shared/business';

function settingText(settings: SiteSettings, ...keys: string[]) {
  for (const key of keys) {
    const value = settings[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function absoluteAsset(origin: string, value: unknown, fallbackPath: string) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('data:')) return new URL(fallbackPath, origin).toString();
  try { return new URL(raw, origin).toString(); }
  catch { return new URL(fallbackPath, origin).toString(); }
}

function profileFromEnvironment(origin: string, settings: SiteSettings) {
  return buildBusinessProfile({
    businessLegalName: process.env.BUSINESS_LEGAL_NAME,
    businessTradingName: settingText(settings, 'company_name', 'site_title') || process.env.BUSINESS_TRADING_NAME,
    businessTagline: settingText(settings, 'company_subtitle', 'site_subtitle') || process.env.BUSINESS_TAGLINE,
    businessDescription: settingText(settings, 'site_description', 'company_description') || process.env.BUSINESS_DESCRIPTION,
    businessRegistrationNumber: process.env.BUSINESS_REGISTRATION_NUMBER,
    businessTaxId: process.env.BUSINESS_TAX_ID,
    businessStreet: process.env.BUSINESS_STREET,
    businessLocality: process.env.BUSINESS_LOCALITY,
    businessRegion: process.env.BUSINESS_REGION,
    businessPostalCode: process.env.BUSINESS_POSTAL_CODE,
    contactPhone: settingText(settings, 'contact_phone', 'phone') || process.env.BUSINESS_PHONE || process.env.NEXT_PUBLIC_CONTACT_PHONE,
    businessEmail: settingText(settings, 'contact_email', 'email') || process.env.BUSINESS_EMAIL,
    businessOpeningHours: process.env.BUSINESS_OPENING_HOURS,
    businessOpeningHoursSpec: process.env.BUSINESS_OPENING_HOURS_SPEC,
    businessLatitude: process.env.BUSINESS_LATITUDE,
    businessLongitude: process.env.BUSINESS_LONGITUDE,
    siteUrl: origin,
  });
}

export async function BusinessStructuredData() {
  const [origin, settings] = await Promise.all([requestOrigin(), getSiteSettings()]);
  const business = profileFromEnvironment(origin, settings);
  const identifiers: Record<string, unknown> = {};
  if (business.taxId) identifiers.taxID = business.taxId;
  if (business.registrationNumber) identifiers.identifier = business.registrationNumber;
  const geo = business.latitude && business.longitude ? { geo: { '@type': 'GeoCoordinates', latitude: business.latitude, longitude: business.longitude } } : {};
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    '@id': `${business.siteUrl.replace(/\/$/, '')}/#business`,
    name: business.tradingName,
    legalName: business.legalName,
    description: business.description,
    url: business.siteUrl,
    telephone: business.phone,
    email: business.email,
    image: absoluteAsset(origin, settings.logo_url || settings.logo_data_url, '/legacy-assets/logo.png'),
    priceRange: '฿฿',
    currenciesAccepted: 'THB',
    paymentAccepted: 'เงินสด, โอนเงิน, พร้อมเพย์, บัตรเครดิต, เก็บเงินปลายทาง',
    openingHours: business.openingHoursSpec,
    address: {
      '@type': 'PostalAddress',
      streetAddress: business.address.street,
      addressLocality: business.address.locality,
      addressRegion: business.address.region,
      postalCode: business.address.postalCode,
      addressCountry: business.address.countryCode,
    },
    areaServed: { '@type': 'Country', name: 'ประเทศไทย' },
    ...identifiers,
    ...geo,
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(payload).replace(/</g, '\\u003c') }}/>;
}
