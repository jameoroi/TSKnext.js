import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
export function proxy(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-request-id', requestId);
  if (request.nextUrl.pathname.startsWith('/api/')) response.headers.set('x-robots-tag', 'noindex, nofollow');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js).*)'] };
