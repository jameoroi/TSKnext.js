'use client';

import type { ReactNode } from 'react';
import { AutoRail } from './auto-rail';

/**
 * Mobile-only presentation for dynamic home sections.
 *
 * The desktop layout remains a normal grid, while phones get one swipeable
 * row with the same smooth autoplay/drag behaviour used by promo banners.
 * Keeping this wrapper mobile-only avoids changing the information density
 * of the desktop storefront.
 */
export function MobileAutoRail({
  children,
  itemClassName,
  label,
  speed = 36,
}: {
  children: ReactNode;
  itemClassName: string;
  label: string;
  speed?: number;
}) {
  return (
    <div className="md:hidden" data-mobile-auto-rail="true">
      <AutoRail itemClassName={itemClassName} label={label} speed={speed} arrows>
        {children}
      </AutoRail>
    </div>
  );
}
