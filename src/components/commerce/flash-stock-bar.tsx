'use client';

import styled from '@emotion/styled';

const Bar = styled.div({
  height: 6,
  overflow: 'hidden',
  borderRadius: 9999,
  backgroundColor: '#f1f5f9',
});

const Fill = styled.div<{ percent: number }>(({ percent }) => ({
  height: '100%',
  borderRadius: 9999,
  width: `${Math.max(6, Math.min(100, percent))}%`,
  backgroundImage: 'linear-gradient(to right, #f97316, #e11d48)',
  transition: 'width 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
}));

const Left = styled.p({
  marginTop: 4,
  fontSize: 11,
  fontWeight: 800,
  color: '#be123c',
});

/** แถบสต็อกคงเหลือสำหรับ Flash Sale — สไตล์ด้วย Emotion */
export function FlashStockBar({ stock }: { stock: number }) {
  const percent = Math.round((Math.min(30, Math.max(0, stock)) / 30) * 100);
  return (
    <div>
      <Bar
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`เหลือสินค้า ${stock} ชิ้น`}
      >
        <Fill percent={percent} />
      </Bar>
      <Left>เหลือ {Number(stock).toLocaleString('th-TH')} ชิ้น</Left>
    </div>
  );
}
