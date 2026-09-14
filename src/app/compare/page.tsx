import type { Metadata } from 'next';
import { CompareProducts } from '@/components/customer/compare-products';

export const metadata: Metadata = {
  title: 'เปรียบเทียบสินค้า | THAISERKIT SUPPLY',
  description: 'เปรียบเทียบสเปก ราคา แบรนด์ และสถานะสินค้าจาก THAISERKIT SUPPLY ได้สูงสุด 4 รายการ',
};

export default function ComparePage() {
  return <CompareProducts />;
}
