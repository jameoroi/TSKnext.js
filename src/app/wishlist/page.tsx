import type { Metadata } from 'next';
import { SavedProducts } from '@/components/customer/saved-products';

export const metadata: Metadata = { title: 'รายการโปรด', robots: { index: false, follow: false } };
export default function WishlistPage() {
  return <SavedProducts mode="wishlist" />;
}
