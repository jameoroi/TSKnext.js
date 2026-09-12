export const ORDER_TRANSITIONS: Record<string, string[]> = {
  pending_payment: ['awaiting_verification', 'paid', 'cancelled', 'expired'],
  awaiting_verification: ['paid', 'cancelled', 'expired'],
  new: ['paid', 'cancelled', 'expired'],
  new_cod: ['processing', 'cancelled'],
  paid: ['processing', 'cancelled', 'refunded'],
  processing: ['packing', 'cancelled', 'refunded'],
  packing: ['shipped', 'cancelled', 'refunded'],
  shipped: ['completed', 'refunded'],
  completed: ['refunded'],
  cancelled: [],
  refunded: [],
  expired: [],
};

const isCod = (paymentMethod: unknown) => /COD|ปลายทาง/i.test(String(paymentMethod || ''));

export function canMoveTo(order: { status?: string; payment_method?: string }, next: string) {
  const current = String(order?.status || '');
  if (current === next) return true;
  const key = current === 'new' && isCod(order?.payment_method) ? 'new_cod' : current;
  return (ORDER_TRANSITIONS[key] || []).includes(next);
}

export function whyBlocked(order: { status?: string; payment_method?: string }, next = '') {
  const current = String(order?.status || '');
  const key = current === 'new' && isCod(order?.payment_method) ? 'new_cod' : current;
  const allowed = ORDER_TRANSITIONS[key] || [];
  if (!allowed.length) return 'คำสั่งซื้อนี้จบแล้ว เปลี่ยนสถานะต่อไม่ได้';
  if (next && allowed.includes(next)) return '';
  return `จากสถานะนี้เปลี่ยนได้เฉพาะ: ${allowed.join(', ')}`;
}
