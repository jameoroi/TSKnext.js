import type { Metadata } from 'next';
import { PageHero } from '@/components/content/page-hero';
import { PartnerForm } from '@/components/forms/partner-form';
import { getPageBanners } from '@/server/page-banners';

export const metadata: Metadata = {
  title: 'สมัครเป็นตัวแทนจำหน่าย',
  description: 'สมัครเป็นตัวแทนจำหน่ายและพาร์ทเนอร์ของ THAISERKIT SUPPLY',
};
export default async function Page() {
  const slides = await getPageBanners('partners');
  return (
    <>
      <PageHero
        slides={slides}
        title="สมัครเป็นตัวแทนจำหน่าย"
        subtitle="เริ่มขายโดยใช้หน้าร้านและระบบติดตามค่าคอมมิชชั่นของ THAISERKIT SUPPLY"
      />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <PartnerForm />
      </div>
    </>
  );
}
