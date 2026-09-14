'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { Footer } from './footer';
import { Header } from './header';
import { StorefrontChrome } from './storefront-chrome';
import { ToastHost } from './toast-host';
import { TrustStrip } from './trust-strip';

// These are interaction-only surfaces. Split them out of the critical
// storefront chunk so the home/catalog HTML can become interactive sooner;
// Zustand retains a click made before a lazy dialog finishes loading.
const AuthModal = dynamic(() => import('@/components/auth/auth-modal').then((module) => module.AuthModal), {
  ssr: false,
});
const QuickViewModal = dynamic(
  () => import('@/components/commerce/quick-view-modal').then((module) => module.QuickViewModal),
  { ssr: false },
);
const CustomerChatWidget = dynamic(
  () => import('./customer-chat-widget').then((module) => module.CustomerChatWidget),
  { ssr: false },
);
const PwaInstallPrompt = dynamic(
  () => import('@/components/platform/pwa-install-prompt').then((module) => module.PwaInstallPrompt),
  { ssr: false },
);

const APP_PREFIXES = ['/admin', '/report', '/agent', '/supplier', '/owner', '/operations'];

export function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <>
          {children}
          <ToastHost />
        </>
      }
    >
      <ChromeShell>{children}</ChromeShell>
    </Suspense>
  );
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
      <Header />
      <main id="main-content">{children}</main>
      <TrustStrip />
      <Footer />
      <StorefrontChrome />
      <QuickViewModal />
      <AuthModal />
      <CustomerChatWidget />
      <PwaInstallPrompt />
      <ToastHost />
    </div>
  );
}
