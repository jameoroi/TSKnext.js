'use client';

import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { AuthModal } from '@/components/auth/auth-modal';
import { QuickViewModal } from '@/components/commerce/quick-view-modal';
import { PwaInstallPrompt } from '@/components/platform/pwa-install-prompt';
import { CustomerChatWidget } from './customer-chat-widget';
import { Footer } from './footer';
import { Header } from './header';
import { StorefrontChrome } from './storefront-chrome';
import { ToastHost } from './toast-host';
import { TrustStrip } from './trust-strip';

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
