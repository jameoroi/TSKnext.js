// RFC 9116 security contact. Built on every deploy, so Expires stays in the future.
export const dynamic = 'force-static';

export function GET() {
  const contact = String(process.env.BUSINESS_EMAIL || 'thaiserkit.supply@gmail.com').trim();
  const origin = String(process.env.APP_ORIGIN || 'https://jayxtsk.shop').replace(/\/$/, '');
  const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  const body = [
    `Contact: mailto:${contact}`,
    `Expires: ${expires}`,
    'Preferred-Languages: th, en',
    `Canonical: ${origin}/.well-known/security.txt`,
    `Policy: ${origin}/privacy`,
    '',
  ].join('\n');
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' },
  });
}
