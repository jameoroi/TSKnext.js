import type { Metadata } from 'next';
import { CheckoutForm } from '@/components/commerce/checkout-form';
import { getLegacySession } from '@/server/auth/legacy-session';
import { safeLegacy } from '@/server/safe-legacy';

export const metadata: Metadata = { title: 'ชำระเงิน', robots: { index: false, follow: false } };


type Props = { searchParams: Promise<{ coupon?: string }> };

export default async function CheckoutPage({ searchParams }: Props) {
  const session = await getLegacySession();
  const signedIn = Boolean(session.customer);
  const [checkout, addressData, params] = await Promise.all([
    safeLegacy<any>('checkout.settings', {}, { payment: { bank_transfer_enabled: true, cod_enabled: true, line_order_enabled: false } }),
    signedIn ? safeLegacy<any>('customer.addresses.list', {}, { addresses: [] }) : Promise.resolve({ addresses: [] }),
    searchParams,
  ]);
  return <CheckoutForm
    signedIn={signedIn}
    customer={(session.customer as Record<string, any> | null) || null}
    addresses={addressData.addresses || []}
    payment={checkout.payment || {}}
    initialCoupon={String(params.coupon || '')}
  />;
}
