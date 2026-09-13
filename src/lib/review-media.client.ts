'use client';

import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';

const MAX_BYTES = 5 * 1024 * 1024;
const UPLOADABLE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);

export async function uploadReviewImage(file: File, options: { productId: string; csrf: string }) {
  const mime = String(file.type || '').toLowerCase();
  if (!UPLOADABLE.has(mime)) throw new Error('รองรับเฉพาะไฟล์ PNG, JPG, WEBP, GIF หรือ AVIF');
  if (file.size <= 0 || file.size > MAX_BYTES) throw new Error('รูปรีวิวต้องมีขนาดไม่เกิน 5 MB');

  let presigned: { upload_url?: string; key?: string; public_url?: string };
  try {
    presigned = await legacyRequest(
      'customer.review.media.presign',
      {
        product_id: options.productId,
        filename: file.name || 'review-image.webp',
        mime_type: mime,
        size_bytes: file.size,
        csrf: options.csrf,
      },
      'POST',
    );
  } catch (error) {
    if (error instanceof LegacyApiError && error.code === 'media_storage_not_configured') {
      throw new Error('ระบบเก็บรูปยังไม่ได้ตั้งค่า MEDIA หรือ Supabase Storage');
    }
    throw error;
  }

  const uploadUrl = String(presigned.upload_url || '');
  const key = String(presigned.key || '');
  if (!uploadUrl || !key) throw new Error('ไม่ได้รับ URL สำหรับอัปโหลดรูป');
  const uploaded = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': mime, 'cache-control': 'public, max-age=31536000, immutable' },
    body: file,
  });
  if (!uploaded.ok) throw new Error(`อัปโหลดรูปไม่สำเร็จ (${uploaded.status})`);

  const committed = await legacyRequest<{ asset?: { public_url?: string } }>(
    'customer.review.media.commit',
    {
      product_id: options.productId,
      key,
      mime_type: mime,
      size_bytes: file.size,
      csrf: options.csrf,
    },
    'POST',
  );
  const publicUrl = String(committed.asset?.public_url || presigned.public_url || '');
  if (!publicUrl) throw new Error('ระบบไม่คืนที่อยู่รูปหลังอัปโหลด');
  return publicUrl;
}
