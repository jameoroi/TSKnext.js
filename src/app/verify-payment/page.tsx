import type { Metadata } from 'next';
import { PaymentSlipForm } from '@/components/customer/payment-slip-form';

export const metadata: Metadata = {
  title: 'ยืนยันการชำระเงิน | THAISERKIT SUPPLY',
  description: 'แนบสลิปโอนเงินเพื่อให้ทีมงานตรวจสอบและยืนยันคำสั่งซื้อของคุณ',
  robots: { index: false, follow: false },
};

export default function VerifyPaymentPage() {
  return <PaymentSlipForm />;
}
