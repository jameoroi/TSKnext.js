import type { Metadata } from 'next';
import { PageHero } from '@/components/content/page-hero';
import { QuotationForm } from '@/components/forms/quotation-form';

export const metadata: Metadata = {
  title: 'ขอใบเสนอราคา | THAISERKIT SUPPLY',
  description: 'ขอใบเสนอราคาสินค้าเครื่องมือช่างและอุปกรณ์อุตสาหกรรม สำหรับงานโครงการและสั่งล็อตใหญ่',
};

export default function Page() {
  return (
    <>
      <PageHero title="ขอใบเสนอราคา" subtitle="งานโครงการ สั่งล็อตใหญ่ รับราคาพิเศษพร้อมใบเสนอราคาและใบกำกับภาษี" />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <QuotationForm />
      </div>
    </>
  );
}
