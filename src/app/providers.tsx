'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, useState } from 'react';
import { MarketingRuntime } from '@/components/analytics/marketing-runtime';
import { PwaRegister } from '@/components/platform/pwa-register';
import { SessionHeartbeat } from '@/components/platform/session-heartbeat';
import { StorefrontRuntime } from '@/components/platform/storefront-runtime';
import { CookieConsent } from '@/components/privacy/cookie-consent';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <PwaRegister />
      <SessionHeartbeat />
      <Suspense fallback={null}>
        <StorefrontRuntime />
        <MarketingRuntime />
      </Suspense>
      {children}
      <CookieConsent />
    </QueryClientProvider>
  );
}
