import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  browserSecurityHeaders,
  isHttpsProduction,
} from '../../apps/web/src/lib/browser-security.js';
import { config, proxy } from '../../apps/web/src/proxy.js';

const nonce = 'rF6u7s2J1ckyeRrQgZtC6A==';
afterEach(() => vi.unstubAllEnvs());

describe('private browser security policy', () => {
  it('requires a per-document nonce and denies framing, executable uploads and external forms', () => {
    const headers = browserSecurityHeaders({ nonce, development: false, httpsProduction: true });
    const policy = headers['Content-Security-Policy'];
    expect(policy).toContain(`script-src 'nonce-${nonce}' 'strict-dynamic'`);
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("script-src 'unsafe-inline'");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain('upgrade-insecure-requests');
    expect(headers).toMatchObject({
      'Cache-Control': 'private, no-store',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Strict-Transport-Security': 'max-age=31536000',
    });
    expect(headers['Permissions-Policy']).toContain('camera=()');
    expect(headers['Permissions-Policy']).toContain('geolocation=()');
  });

  it('keeps the necessary inline chart styles without allowing inline script or external connections', () => {
    const policy = browserSecurityHeaders({ nonce, development: false, httpsProduction: false })[
      'Content-Security-Policy'
    ];
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).not.toContain('ws:');
    expect(policy).not.toContain('https:');
  });

  it('allows development bundler evaluation and loopback hot reload only in development', () => {
    const headers = browserSecurityHeaders({ nonce, development: true, httpsProduction: false });
    expect(headers['Content-Security-Policy']).toContain("'unsafe-eval'");
    expect(headers['Content-Security-Policy']).toContain('ws://localhost:*');
    expect(headers['Content-Security-Policy']).not.toContain('upgrade-insecure-requests');
    expect(headers).not.toHaveProperty('Strict-Transport-Security');
  });

  it('uses the stronger sandbox policy for JSON and untrusted file delivery', () => {
    const headers = browserSecurityHeaders({
      nonce,
      development: false,
      httpsProduction: true,
      apiResponse: true,
    });
    expect(headers['Content-Security-Policy']).toContain("default-src 'none'; sandbox");
    expect(headers['Content-Security-Policy']).not.toContain('nonce-');
    expect(headers['Content-Security-Policy']).not.toContain("'unsafe-inline'");
    expect(headers['Cache-Control']).toBe('private, no-store');
  });

  it.each(['', 'attacker-nonce', `${nonce}\n`, `${nonce}; script-src *`])(
    'rejects malformed nonce input: %j',
    (value) => {
      expect(() =>
        browserSecurityHeaders({ nonce: value, development: false, httpsProduction: false }),
      ).toThrow('Invalid document nonce.');
    },
  );

  it('enables HSTS only with configured HTTPS production, without including unrelated subdomains', () => {
    expect(isHttpsProduction('production', 'https://journal.example.test')).toBe(true);
    expect(isHttpsProduction('production', 'http://localhost:3000')).toBe(false);
    expect(isHttpsProduction('test', 'https://localhost:3000')).toBe(false);
    expect(isHttpsProduction('production', 'not-an-origin')).toBe(false);
    expect(isHttpsProduction('production', undefined)).toBe(false);
  });
});

describe('Next request policy boundary', () => {
  it('excludes only framework assets and exact public filenames, including similarly prefixed documents', () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`, 'u');
    for (const pathname of [
      '/sign-in',
      '/record',
      '/api/v1/session',
      '/favicon.ico/extra',
      '/robots.txt-extra',
      '/_next/image-other',
    ]) {
      expect(matcher.test(pathname), pathname).toBe(true);
    }
    for (const pathname of [
      '/_next/static/chunks/app.js',
      '/_next/image',
      '/favicon.ico',
      '/robots.txt',
      '/sitemap.xml',
    ]) {
      expect(matcher.test(pathname), pathname).toBe(false);
    }
  });

  it('replaces forged client policy/nonce headers and never reuses a document nonce', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
    const request = new Request('http://localhost:3000/sign-in', {
      headers: {
        'Content-Security-Policy': 'script-src *',
        'x-nonce': 'forged',
        'x-forwarded-proto': 'https',
      },
    }) as Parameters<typeof proxy>[0];
    const first = proxy(request);
    const second = proxy(request);
    const firstNonce = first.headers.get('x-middleware-request-x-nonce');
    expect(firstNonce).toMatch(/^[A-Za-z0-9+/]{22}==$/u);
    expect(firstNonce).not.toBe('forged');
    expect(second.headers.get('x-middleware-request-x-nonce')).not.toBe(firstNonce);
    expect(first.headers.get('content-security-policy')).toContain(`'nonce-${firstNonce}'`);
    expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(
      first.headers.get('content-security-policy'),
    );
    expect(first.headers.has('strict-transport-security')).toBe(false);
    expect(first.headers.get('cache-control')).toBe('private, no-store');
  });

  it('applies framing and sandbox protection to API calls regardless of prefetch metadata', () => {
    const request = new Request('http://localhost:3000/api/v1/session', {
      headers: { 'next-router-prefetch': '1', purpose: 'prefetch' },
    }) as Parameters<typeof proxy>[0];
    const response = proxy(request);
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'none'; sandbox",
    );
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
