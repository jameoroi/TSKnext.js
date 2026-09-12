/**
 * A presigned S3 address, signed here rather than by a toolkit.
 *
 * Cloudflare R2 speaks S3, and the obvious way to talk to it is
 * `@aws-sdk/client-s3` with `@aws-sdk/s3-request-presigner` — both of which are
 * already in package.json, and neither of which is imported anywhere. That is
 * lucky. This runtime is a Cloudflare Pages Function, the whole worker is about
 * 317 kB compressed today, and the compressed ceiling is one megabyte: the S3
 * client alone is comparable to everything the shop currently ships. It would
 * have been added for one job — turning a key into a signed URL — that is a
 * page of arithmetic against a published specification.
 *
 * So: SigV4 query signing, on Web Crypto, which both the worker and Node have.
 * Nothing is stored and nothing is streamed through here; the caller gets an
 * address the browser can PUT to directly, the same shape the Supabase path
 * already returns, so everything above it is unchanged.
 *
 * Deliberately narrow. Query signing with an unsigned payload and `host` as the
 * only signed header, which is all a presigned upload or delete needs. It is
 * not a general S3 client and should not grow into one.
 *
 * Reference: AWS Signature Version 4, "Signing AWS requests with Signature
 * Version 4" — query parameter variant.
 */

const encoder = new TextEncoder();
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(key, message) {
  const imported = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, encoder.encode(message)));
}

async function sha256Hex(message) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(message))));
}

/**
 * RFC 3986 encoding, which is not what encodeURIComponent does.
 *
 * `!`, `'`, `(`, `)` and `*` are left alone by encodeURIComponent and must be
 * escaped for the signature to match; `/` between key segments must not be.
 * A key containing a bracket is rare and a signature that silently fails on it
 * is worse than rare, so this is done properly.
 */
function uriEncode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

const encodeKeyPath = (key) => String(key).split('/').map(uriEncode).join('/');

/**
 * A URL the holder can use, once, for one method, until it expires.
 *
 * `forcePathStyle` puts the bucket in the path rather than the hostname, which
 * is what R2's endpoint expects and what a MinIO or Ceph endpoint usually
 * wants too. Virtual-host style is there for S3 proper.
 */
export async function presignS3Url({
  endpoint,
  region = 'auto',
  bucket,
  accessKeyId,
  secretAccessKey,
  key,
  method = 'PUT',
  expiresIn = 900,
  forcePathStyle = true,
  // Injectable only so a test can pin it. A signature is a function of the
  // second it was made in, so two implementations signing "now" disagree
  // whenever they land either side of a tick — which is not a disagreement
  // about the arithmetic, and a test that cannot tell those apart is no use.
  now = new Date(),
}) {
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !key) throw new Error('s3_presign_missing_config');

  const base = new URL(String(endpoint).replace(/\/+$/, ''));
  const host = forcePathStyle ? base.host : `${bucket}.${base.host}`;
  const canonicalUri = forcePathStyle
    ? `/${uriEncode(bucket)}/${encodeKeyPath(key)}`
    : `/${encodeKeyPath(key)}`;

  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');   // 20260902T120000Z
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/s3/aws4_request`;

  // Sorted by key, as the canonical form requires. These are the only ones.
  const query = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(Math.max(1, Math.min(604800, Number(expiresIn) || 900)))],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  const canonicalQuery = query
    .map(([k, v]) => [uriEncode(k), uriEncode(v)])
    .sort((a, z) => (a[0] < z[0] ? -1 : a[0] > z[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const canonicalRequest = [
    String(method).toUpperCase(),
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  let signingKey = encoder.encode(`AWS4${secretAccessKey}`);
  for (const part of [dateStamp, region, 's3', 'aws4_request']) signingKey = await hmac(signingKey, part);
  const signature = hex(await hmac(signingKey, stringToSign));

  return `${base.protocol}//${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
