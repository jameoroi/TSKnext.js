import type { Metadata } from 'next';
import { EquipmentKitBuilder } from '@/components/kits/equipment-kit-builder';
import { getBrands, getCategories, getProducts } from '@/server/catalog';
import { getPublicEquipmentSets } from '@/server/equipment-kits';

export const metadata: Metadata = {
  title: 'จัดเซ็ตอุปกรณ์ | THAISERKIT SUPPLY',
  description: 'จัดชุดเครื่องมือและอุปกรณ์เอง หรือให้ AI เลือกจากแคตตาล็อกจริงตามประเภทงาน งบประมาณ และของที่มีอยู่แล้ว',
};

export default async function EquipmentKitsPage() {
  const [catalog, categoryRows, brandRows, presets] = await Promise.all([
    getProducts({ page: 1, per_page: 160, status: 'active' }),
    getCategories(),
    getBrands(),
    getPublicEquipmentSets(12),
  ]);
  const categories = Array.from(new Set(categoryRows.map((row) => String(row.name || row.key || '')).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
  const brands = Array.from(new Set(brandRows.map((row) => String(row.name || row.id || '')).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));

  return <main className="mx-auto max-w-7xl px-4 py-8 lg:px-6 lg:py-10">
    <EquipmentKitBuilder products={catalog.products} categories={categories} brands={brands} presets={presets}/>
  </main>;
}
