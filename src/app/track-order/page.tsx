import type { Metadata } from 'next';
import { TrackOrderForm } from '@/components/customer/track-order-form';

export const metadata: Metadata = {
  title: 'ติดตามคำสั่งซื้อ | THAISERKIT SUPPLY',
  description: 'ตรวจสอบสถานะคำสั่งซื้อและเลขพัสดุของ THAISERKIT SUPPLY',
  robots: { index: false, follow: false },
};

export default function TrackOrderPage() {
  return <TrackOrderForm />;
}
