import { describe, expect, it } from 'vitest';
import { parseServerConfig } from '@journal/server/config';
import { assertApplicationMutation, assertTrustedOrigin } from '@journal/server';
import { createCsrfToken, readBoundedJson } from '../../packages/server/src/security.js';

const config = parseServerConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://app:test@localhost/journal',
  AUTH_DATABASE_URL: 'postgres://auth:test@localhost/journal',
  JOB_DATABASE_URL: 'postgres://jobs:test@localhost/journal',
  BETTER_AUTH_SECRET: 'unit-test-secret-of-at-least-32-characters',
  APP_ORIGIN: 'http://localhost:3000',
});

describe('application mutation security', () => {
  it('binds CSRF proof to the authenticated session and exact application origin', () => {
    const proof = createCsrfToken('opaque-session-one', config);
    const request = new Request('http://localhost:3000/api/v1/example', {
      method: 'POST',
      headers: { origin: config.appOrigin, 'x-csrf-token': proof },
    });
    expect(proof).not.toContain('opaque-session-one');
    expect(() => assertApplicationMutation(request, 'opaque-session-one', config)).not.toThrow();
    expect(() => assertApplicationMutation(request, 'opaque-session-two', config)).toThrow();
    expect(() =>
      assertApplicationMutation(
        new Request(request, {
          headers: { origin: 'https://attacker.example', 'x-csrf-token': proof },
        }),
        'opaque-session-one',
        config,
      ),
    ).toThrow();
  });

  it('rejects missing origins and cross-site metadata even if a token is supplied', () => {
    expect(() => assertTrustedOrigin(new Request(config.appOrigin), config)).toThrow();
    const request = new Request(config.appOrigin, {
      method: 'POST',
      headers: {
        origin: config.appOrigin,
        'sec-fetch-site': 'cross-site',
        'x-csrf-token': createCsrfToken('session', config),
      },
    });
    expect(() => assertApplicationMutation(request, 'session', config)).toThrow();
  });

  it('bounds actual bytes and refuses text/form content for auth mutations', async () => {
    const large = new Request(config.appOrigin, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(100) }),
    });
    await expect(readBoundedJson(large, 20)).rejects.toMatchObject({ status: 413 });
    const form = new Request(config.appOrigin, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    });
    await expect(readBoundedJson(form)).rejects.toMatchObject({ status: 415 });
  });
});
