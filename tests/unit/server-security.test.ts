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

  it('rejects read methods and differently encoded CSRF proofs without accepting a prefix', () => {
    const proof = createCsrfToken('security-regression-session', config);
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(() =>
        assertApplicationMutation(
          new Request(config.appOrigin, {
            method,
            headers: { origin: config.appOrigin, 'x-csrf-token': proof },
          }),
          'security-regression-session',
          config,
        ),
      ).toThrow(expect.objectContaining({ status: 405, code: 'METHOD_NOT_ALLOWED' }));
    }
    for (const supplied of [proof.slice(0, -1), `${proof}x`, 'é'.repeat(proof.length)]) {
      expect(() =>
        assertApplicationMutation(
          new Request(config.appOrigin, {
            method: 'POST',
            headers: { origin: config.appOrigin, 'x-csrf-token': supplied },
          }),
          'security-regression-session',
          config,
        ),
      ).toThrow(expect.objectContaining({ status: 403, code: 'INVALID_CSRF' }));
    }
  });

  it('counts streamed bytes even when Content-Length understates untrusted JSON', async () => {
    let cancelled = false;
    const request = new Request(config.appOrigin, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '2' },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"value":"'));
          controller.enqueue(new TextEncoder().encode('untrusted'.repeat(16)));
        },
        cancel() {
          cancelled = true;
        },
      }),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    await expect(readBoundedJson(request, 32)).rejects.toMatchObject({
      status: 413,
      code: 'INPUT_TOO_LARGE',
    });
    expect(cancelled).toBe(true);
    expect(request.body?.locked).toBe(false);
  });

  it('reads one-byte JSON fragments and empty chunks at the exact UTF-8 byte limit', async () => {
    const expected = { text: 'é漢字'.repeat(2_200) };
    const encoded = new TextEncoder().encode(JSON.stringify(expected));
    expect(encoded.byteLength).toBeGreaterThan(16_384);
    let position = 0;
    let empty = false;
    const request = new Request(config.appOrigin, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: new ReadableStream({
        pull(controller) {
          if (position === encoded.length) {
            controller.close();
          } else if (!empty) {
            controller.enqueue(new Uint8Array());
            empty = true;
          } else {
            controller.enqueue(encoded.subarray(position, position + 1));
            position += 1;
            empty = false;
          }
        },
      }),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    await expect(readBoundedJson(request, encoded.byteLength)).resolves.toEqual(expected);
    expect(request.body?.locked).toBe(false);
  });

  it('copies each received chunk before a producer reuses its buffer', async () => {
    const encoded = new TextEncoder().encode('{"value":"copied once"}');
    const shared = new Uint8Array(1);
    let position = 0;
    const request = new Request(config.appOrigin, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: new ReadableStream(
        {
          pull(controller) {
            if (position === encoded.length) {
              controller.close();
              return;
            }
            shared[0] = encoded[position]!;
            position += 1;
            controller.enqueue(shared);
          },
        },
        { highWaterMark: 0 },
      ),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    await expect(readBoundedJson(request, encoded.byteLength)).resolves.toEqual({
      value: 'copied once',
    });
  });

  it('accepts an empty body after many empty chunks without retaining chunk metadata', async () => {
    let remaining = 20_000;
    const request = new Request(config.appOrigin, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: new ReadableStream({
        pull(controller) {
          if (remaining === 0) controller.close();
          else {
            remaining -= 1;
            controller.enqueue(new Uint8Array());
          }
        },
      }),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    await expect(readBoundedJson(request)).resolves.toEqual({});
    expect(request.body?.locked).toBe(false);
  });

  it('allows the 64-level JSON boundary for mixed objects and arrays', async () => {
    let value: unknown = 'bounded';
    for (let depth = 0; depth < 64; depth += 1) {
      value = depth % 2 === 0 ? { child: value } : [value];
    }
    const request = new Request(config.appOrigin, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    });
    const parsed = await readBoundedJson(request);
    // Serialize for comparison so the test's assertion traversal has no effect
    // on whether the transport guard accepts the boundary.
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(value));
  });

  it.each([65, 2_000])(
    'rejects %i nested JSON objects before recursive validation',
    async (depth) => {
      const body = '{"a":'.repeat(depth) + 'null' + '}'.repeat(depth);
      expect(Buffer.byteLength(body)).toBeLessThan(16_384);
      const request = new Request(config.appOrigin, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      await expect(readBoundedJson(request)).rejects.toMatchObject({
        status: 400,
        code: 'INPUT_TOO_DEEP',
      });
    },
  );

  it('rejects nested JSON arrays without treating brackets inside strings as structure', async () => {
    const hostile = new Request(config.appOrigin, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '['.repeat(2_000) + '0' + ']'.repeat(2_000),
    });
    await expect(readBoundedJson(hostile)).rejects.toMatchObject({
      status: 400,
      code: 'INPUT_TOO_DEEP',
    });
    const literal = { value: '\\"[{'.repeat(200) };
    const accepted = new Request(config.appOrigin, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(literal),
    });
    await expect(readBoundedJson(accepted)).resolves.toEqual(literal);
  });
});
