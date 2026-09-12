import { S3Client } from '@aws-sdk/client-s3';

let s3: S3Client | null | undefined;

export function s3Client() {
  if (s3 !== undefined) return s3;
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return (s3 = null);
  s3 = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === '1',
    credentials: { accessKeyId, secretAccessKey },
  });
  return s3;
}

export const mediaBucket = () => process.env.S3_BUCKET || process.env.MEDIA_BUCKET || '';
