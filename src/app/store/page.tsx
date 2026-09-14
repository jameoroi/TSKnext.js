import type { Metadata } from 'next';
import { PartnerStorefront } from '@/components/partner/storefront';
import { safeLegacy } from '@/server/safe-legacy';
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const code = String(sp.ref || sp.code || '');
  const d = code
    ? await safeLegacy<any>('partner.store', { code }, { agent: null, products: [] })
    : { agent: null, products: [] };
  const title = d.agent ? `${d.agent.store_name} | ตัวแทนจำหน่าย THAISERKIT SUPPLY` : 'ร้านตัวแทน';
  return {
    title,
    description: d.agent?.store_bio || 'ร้านตัวแทนจำหน่ายอย่างเป็นทางการของ THAISERKIT SUPPLY',
    robots: { index: Boolean(d.agent), follow: true },
  };
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const code = String(sp.ref || sp.code || '').trim();
  const d = code
    ? await safeLegacy<any>('partner.store', { code }, { agent: null, products: [] })
    : { agent: null, products: [] };
  if (!d.agent)
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-3xl font-bold">ไม่พบร้านตัวแทน</h1>
        <p className="mt-2 text-slate-500">กรุณาตรวจสอบ referral code อีกครั้ง</p>
      </div>
    );
  return <PartnerStorefront agent={d.agent} products={d.products || []} code={code} />;
}
