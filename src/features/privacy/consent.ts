'use client';

export type ConsentPreferences = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
};

const STORAGE_KEY = 'tsk:consent:v1';
const COOKIE_KEY = 'tsk_consent_v1';
const EVENT_NAME = 'tsk:consent-change';

export function defaultConsent(): ConsentPreferences {
  return { necessary: true, analytics: false, marketing: false, updatedAt: '' };
}

export function readConsent(): ConsentPreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.necessary !== true) return null;
    return {
      necessary: true,
      analytics: parsed.analytics === true,
      marketing: parsed.marketing === true,
      updatedAt: String(parsed.updatedAt || ''),
    };
  } catch {
    return null;
  }
}

export function writeConsent(input: Pick<ConsentPreferences, 'analytics' | 'marketing'>) {
  if (typeof window === 'undefined') return;
  const value: ConsentPreferences = {
    necessary: true,
    analytics: input.analytics === true,
    marketing: input.marketing === true,
    updatedAt: new Date().toISOString(),
  };
  const raw = JSON.stringify(value);
  window.localStorage.setItem(STORAGE_KEY, raw);
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(raw)}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: value }));
}

export function onConsentChange(listener: (value: ConsentPreferences | null) => void) {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => listener((event as CustomEvent<ConsentPreferences>).detail || readConsent());
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

export function openConsentSettings() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tsk:open-consent'));
}
