import { describe, expect, it } from 'vitest';
import { passwordHashing } from '../../packages/server/src/credentials.js';
import { authResponseHeaders } from '../../packages/server/src/auth-gateway.js';

describe('maintained password hooks and auth transport', () => {
  it('uses individually salted Argon2id hashes with reviewed work parameters', async () => {
    const password = 'unit-only-password-with-no-shared-default';
    const [first, second] = await Promise.all([
      passwordHashing.hash(password),
      passwordHashing.hash(password),
    ]);
    expect(first).toMatch(/^\$argon2id\$v=19\$m=32768,t=3,p=1\$/);
    expect(first).not.toEqual(second);
    expect(first).not.toContain(password);
    await expect(passwordHashing.verify({ hash: first, password })).resolves.toBe(true);
    await expect(
      passwordHashing.verify({ hash: first, password: 'incorrect-password' }),
    ).resolves.toBe(false);
  });

  it('verifies existing Better Auth scrypt accounts without implementing a legacy hasher', async () => {
    const password = 'legacy-unit-only-password';
    // Produced by Better Auth 1.7.7's documented crypto API before Argon2id migration.
    const encoded =
      '93a745d202877bce8c9df46ae02c0919:41a73a8fea1d7770e6e53a32d8f4bddc3cfdf0b805362d5e642e633d1181c6dde0a82de35146588edca0bcf93a302b1eeb36ba3263a59e1d5123a5178d34711e';
    await expect(passwordHashing.verify({ hash: encoded, password })).resolves.toBe(true);
    await expect(
      passwordHashing.verify({ hash: encoded, password: 'incorrect-password' }),
    ).resolves.toBe(false);
    await expect(passwordHashing.verify({ hash: '$argon2id$invalid', password })).resolves.toBe(
      false,
    );
    await expect(passwordHashing.verify({ hash: 'unexpected-format', password })).resolves.toBe(
      false,
    );
  });

  it('preserves all Set-Cookie headers and required auth response metadata', () => {
    const source = new Headers({
      location: '/after-sign-in',
      'x-retry-after': '30',
      'content-security-policy': "default-src 'none'",
    });
    source.append('set-cookie', 'journal.session_token=opaque; HttpOnly; SameSite=Lax');
    source.append('set-cookie', 'journal.other=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0');
    const shaped = authResponseHeaders(source);
    expect(shaped.getSetCookie()).toEqual(source.getSetCookie());
    expect(shaped.get('location')).toBe('/after-sign-in');
    expect(shaped.get('retry-after')).toBe('30');
    expect(shaped.get('cache-control')).toBe('no-store');
    expect(shaped.get('content-security-policy')).toBe("default-src 'none'");
  });
});
