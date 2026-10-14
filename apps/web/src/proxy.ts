import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { browserSecurityHeaders, isHttpsProduction } from './lib/browser-security';

/** Security headers only. Every service still checks authentication and workspace authorization. */
export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString('base64');
  const securityHeaders = browserSecurityHeaders({
    nonce,
    development: process.env.NODE_ENV === 'development',
    httpsProduction: isHttpsProduction(process.env.NODE_ENV, process.env.APP_ORIGIN),
    apiResponse: new URL(request.url).pathname.startsWith('/api/'),
  });
  const headers = new Headers(request.headers);
  // Next reads the nonce from the request policy and adds it to its hydration scripts.
  // Replace both headers, including forged client copies, before rendering.
  headers.set('Content-Security-Policy', securityHeaders['Content-Security-Policy']!);
  headers.set('x-nonce', nonce);
  const response = NextResponse.next({ request: { headers } });
  for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
  return response;
}

export const config = {
  // Framework assets remain public/cacheable; all documents, API calls and file deliveries pass here.
  matcher: ['/((?!_next/static/|_next/image$|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$).*)'],
};
