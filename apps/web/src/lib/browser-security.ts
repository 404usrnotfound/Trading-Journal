type BrowserSecurityOptions = {
  nonce: string;
  development: boolean;
  httpsProduction: boolean;
  apiResponse?: boolean;
};

/** One unpredictable nonce per document request; never accept a nonce from the browser. */
export function browserSecurityHeaders({
  nonce,
  development,
  httpsProduction,
  apiResponse = false,
}: BrowserSecurityOptions): Record<string, string> {
  if (nonce.length !== 24 || !/^[A-Za-z0-9+/]{22}==$/u.test(nonce))
    throw new Error('Invalid document nonce.');
  const directives = [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    // React/Recharts use inline style properties for geometry. This does not allow scripts.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${development ? ' ws://localhost:* ws://127.0.0.1:* ws://[::1]:*' : ''}`,
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "worker-src 'none'",
  ];
  if (httpsProduction) directives.push('upgrade-insecure-requests');
  return {
    // Downloads already use sandboxed delivery. Applying that stronger policy to every
    // API response also protects an unexpected error/content-type without weakening files.
    'Content-Security-Policy': apiResponse
      ? "default-src 'none'; sandbox; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
      : directives.join('; '),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cache-Control': 'private, no-store',
    ...(httpsProduction ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
  };
}

/** HTTPS must be configured deliberately; a caller-controlled forwarding header cannot enable it. */
export function isHttpsProduction(
  nodeEnvironment: string | undefined,
  appOrigin: string | undefined,
) {
  if (nodeEnvironment !== 'production' || !appOrigin) return false;
  try {
    return new URL(appOrigin).protocol === 'https:';
  } catch {
    return false;
  }
}
