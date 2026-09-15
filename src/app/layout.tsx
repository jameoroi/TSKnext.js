import type { Metadata, Viewport } from 'next';
import { Kanit } from 'next/font/google';
import { Suspense } from 'react';
import { BusinessStructuredData } from '@/components/seo/business-structured-data';
import { SiteChrome } from '@/components/site/chrome';
import { OfflineBanner } from '@/components/site/offline-banner';
import { publicEnvSnapshot } from '@/lib/public-env';
import { getSiteSettings } from '@/server/catalog';
import { requestOrigin } from '@/server/public-legacy-cache';
import { Providers } from './providers';
import './globals.css';

const kanit = Kanit({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-kanit',
});

export async function generateMetadata(): Promise<Metadata> {
  const [origin, settings] = await Promise.all([requestOrigin(), getSiteSettings()]);
  const siteTitle = String(
    settings.site_title || settings.company_name || 'THAISERKIT SUPPLY | ไทยเซอร์กิจ ซัพพลาย',
  );
  const company = String(settings.company_name || siteTitle);
  const subtitle = String(settings.company_subtitle || '').trim();
  const description = subtitle || `ศูนย์รวมเครื่องมือ อุปกรณ์งานช่าง งานเกษตร และอุตสาหกรรมจาก ${company}`;
  return {
    metadataBase: new URL(origin),
    title: { default: siteTitle, template: `%s | ${company}` },
    description,
    applicationName: siteTitle,
    manifest: '/manifest.webmanifest',
    icons: { icon: '/favicon.ico' },
    openGraph: { type: 'website', locale: 'th_TH', siteName: company, url: origin },
  };
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0B2E22' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <script
          // Runtime public keys (Worker secrets) for the browser; see src/lib/public-env.ts.
          dangerouslySetInnerHTML={{
            __html: `window.__TSK_PUBLIC__=${JSON.stringify(publicEnvSnapshot()).replace(/</g, '\u003c')};`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('tsk_color_mode')||'auto';var d=m==='dark'||(m==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${kanit.className} min-h-screen antialiased`}>
        <OfflineBanner />
        <BusinessStructuredData />
        <Providers>
          <SiteChrome>{children}</SiteChrome>
        </Providers>
      </body>
    </html>
  );
}
