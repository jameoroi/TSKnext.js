import type { Metadata } from 'next';
import { CartView } from '@/components/commerce/cart-view';
export const metadata: Metadata = { title: 'ตะกร้าสินค้า', robots: { index: false, follow: false } };
export default function CartPage(){return <CartView/>}
