export function GET() {
  return new Response('google-site-verification: google902706285278a2c2.html', {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
