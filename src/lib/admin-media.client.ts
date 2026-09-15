'use client';

import { LegacyApiError, legacyRequest } from '@/lib/legacy-api.client';

const UPLOADABLE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('file_read_failed'));
    reader.readAsDataURL(file);
  });
}

export async function scaleImageFile(file: File, maxEdge: number, quality = 0.82): Promise<File> {
  if (typeof window === 'undefined') return file;
  const mime = String(file.type || '').toLowerCase();
  if (mime === 'image/gif' || mime === 'image/svg+xml') return file;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const fallback = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    image.onerror = fallback;
    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) return resolve(file);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return resolve(file);
          const name = `${(file.name || 'image').replace(/\.[^.]+$/, '')}.webp`;
          resolve(new File([blob], name, { type: 'image/webp', lastModified: Date.now() }));
        },
        'image/webp',
        quality,
      );
    };
    image.src = url;
  });
}

function measure(file: File) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    image.src = url;
  });
}

export async function uploadAdminImage(
  file: File,
  options: { ownerType?: string; ownerId?: string; csrf: string },
): Promise<string> {
  const mime = String(file.type || '').toLowerCase();
  if (!UPLOADABLE.has(mime)) return readAsDataUrl(file);

  let presigned: any;
  try {
    presigned = await legacyRequest<any>(
      'admin.media.presign',
      {
        filename: file.name || 'image.png',
        mime_type: mime,
        owner_type: options.ownerType || 'image',
        owner_id: options.ownerId || '',
        csrf: options.csrf,
      },
      'POST',
    );
  } catch (error) {
    if (error instanceof LegacyApiError && error.code === 'media_storage_not_configured')
      return readAsDataUrl(file);
    throw error;
  }

  const uploadUrl = String(presigned?.upload_url || '');
  const key = String(presigned?.key || '');
  if (!uploadUrl || !key) return readAsDataUrl(file);

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'content-type': mime,
      'cache-control': 'public, max-age=31536000, immutable',
    },
    body: file,
  });
  if (!put.ok) {
    const detail = await put.text().catch(() => '');
    const code = (detail.match(/<Code>([^<]+)<\/Code>/) || [])[1] || '';
    throw new Error(`media_upload_failed_${put.status}${code ? `_${code}` : ''}`);
  }

  const { width, height } = await measure(file);
  const committed = await legacyRequest<any>(
    'admin.media.commit',
    {
      key,
      mime_type: mime,
      size_bytes: file.size,
      width,
      height,
      owner_type: options.ownerType || 'image',
      owner_id: options.ownerId || '',
      csrf: options.csrf,
    },
    'POST',
  );

  return String(committed?.asset?.public_url || presigned?.public_url || '') || readAsDataUrl(file);
}
