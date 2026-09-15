'use client';

import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { AuthModal } from '@/components/auth/auth-modal';
import { QuickViewModal } from '@/components/commerce/quick-view-modal';
import { PwaInstallPrompt } from '@/components/platform/pwa-install-prompt';
import { CustomerChatWidget } from './customer-chat-widget';
import { Footer } from './footer';
import { Header } from './header';
import { PageTranslator } from './language';
import { OverlayCoordinator } from './overlay-coordinator';
import { StorefrontChrome } from './storefront-chrome';
import { ToastHost } from './toast-host';
import { TrustStrip } from './trust-strip';

const APP_PREFIXES = ['/admin', '/report', '/agent', '/supplier', '/owner', '/operations'];

// The page itself is rendered once. This used to sit inside a Suspense whose
// fallback also rendered `children`, so dynamic pages streamed their content
// twice (two H1s and two Product JSON-LD blocks per product page) and paid for
// both renders on the Workers CPU budget. usePathname needs no boundary; the
// components that read search params (PromoLink in the header, LoginForm in the
// auth modal) keep their own Suspense boundaries.
export function SiteChrome({ children }: { children: React.ReactNode }) {
  return <ChromeShell>{children}</ChromeShell>;
}

function ChromeShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const app = APP_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (app)
    return (
      <>
        {children}
        <ToastHost />
      </>
    );
  return (
    <div className="pb-16 md:pb-0">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-xl focus:bg-emerald-900 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        ข้ามไปยังเนื้อหา
      </a>
      <Header />
      <main id="main-content">{children}</main>
      <TrustStrip />
      <Footer />
      <StorefrontChrome />
      <QuickViewModal />
      <Suspense fallback={null}>
        <AuthModal />
      </Suspense>
      <CustomerChatWidget />
      <PwaInstallPrompt />
      <ToastHost />
      <PageTranslator />
      <OverlayCoordinator />
    </div>
  );
}
