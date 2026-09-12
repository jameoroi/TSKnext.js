import type { Product } from '@/features/catalog/types';

/**
 * สินค้า/แบรนด์ตัวอย่างสำหรับพรีวิว — แสดงเฉพาะตอนที่ยังไม่มีข้อมูลจริง
 * (ไม่มีฐานข้อมูลต่ออยู่) และจะหายไปเองทันทีที่มีสินค้าจริง
 * ลบไฟล์นี้ทิ้งได้เลยเมื่อต่อ DB จริงแล้ว
 */
export const DEMO_PRODUCTS: Product[] = [
  {
    id: 'demo-dewalt-drill',
    sku: 'DEMO-001',
    name: '[TEST] สว่านโรตารี่ 26mm (สินค้าตัวอย่าง)',
    brand: 'DeWalt',
    category: 'power',
    price: 4590,
    oldPrice: 5290,
    stock: 12,
    available: 12,
    img: '/legacy-assets/banners/1.png',
    state: 'active',
    demo: true,
  },
  {
    id: 'demo-pump-auto',
    sku: 'DEMO-002',
    name: '[TEST] ปั๊มน้ำอัตโนมัติ 400W (สินค้าตัวอย่าง)',
    brand: 'Mitsubishi',
    category: 'pump',
    price: 7890,
    oldPrice: 0,
    stock: 5,
    available: 5,
    img: '/legacy-assets/banners/2.png',
    state: 'active',
    demo: true,
  },
];

export const DEMO_BRANDS = [
  { id: 'dewalt', name: 'DeWalt', logo: '' },
  { id: 'makita', name: 'Makita', logo: '' },
  { id: 'milwaukee', name: 'Milwaukee', logo: '' },
  { id: 'pumpkin', name: 'Pumpkin', logo: '' },
];

export const isDemo = (p: Pick<Product, 'demo'>) => Boolean((p as Record<string, unknown>).demo);
