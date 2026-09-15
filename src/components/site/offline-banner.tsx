'use client';

import { useOffline as useNextOffline } from 'next/offline';
import { useEffect, useState } from 'react';

export function OfflineBanner() {
  const nextOffline = useNextOffline();
  const [browserOffline, setBrowserOffline] = useState<boolean | null>(null);

  useEffect(() => {
    const syncConnectivity = () => setBrowserOffline(!navigator.onLine);

    syncConnectivity();
    window.addEventListener('offline', syncConnectivity);
    window.addEventListener('online', syncConnectivity);

    return () => {
      window.removeEventListener('offline', syncConnectivity);
      window.removeEventListener('online', syncConnectivity);
    };
  }, []);

  const isOffline = browserOffline ?? nextOffline;

  if (!isOffline) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[100] border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-950 shadow-sm dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50"
      role="status"
      aria-live="polite"
      data-testid="offline-banner"
    >
      ออฟไลน์ชั่วคราว — ระบบจะลองเชื่อมต่อและส่งรายการที่ค้างอีกครั้งเมื่อกลับมาออนไลน์
    </div>
  );
}
