import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ServerConfig } from './config.js';
import { ApplicationError } from './errors.js';

// Recursive JSON schemas must receive bounded nesting, even for a small body.
// This transport ceiling leaves room for the stricter domain metadata policies.
const maximumJsonDepth = 64;

function assertBoundedJsonDepth(value: unknown): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
  while (pending.length) {
    const current = pending.pop()!;
    if (current.value === null || typeof current.value !== 'object') continue;
    if (current.depth > maximumJsonDepth) {
      throw new ApplicationError(
        400,
        'INPUT_TOO_DEEP',
        'Invalid request',
        'The JSON request exceeds the nesting limit.',
      );
    }
    for (const child of Object.values(current.value)) {
      if (child !== null && typeof child === 'object') {
        pending.push({ value: child, depth: current.depth + 1 });
      }
    }
  }
}

export function assertTrustedOrigin(request: Request, config: ServerConfig): void {
  if (
    request.headers.get('origin') !== config.appOrigin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    throw new ApplicationError(
      403,
      'UNTRUSTED_ORIGIN',
      'Request rejected',
      'The request must originate from this application.',
    );
  }
}

export function createCsrfToken(sessionToken: string, config: ServerConfig): string {
  return createHmac('sha256', config.betterAuthSecret)
    .update('journal:csrf:v1:')
    .update(sessionToken)
    .digest('base64url');
}

/** A per-session CSRF proof is not an authentication credential. */
export function assertApplicationMutation(
  request: Request,
  sessionToken: string,
  config: ServerConfig,
): void {
  assertTrustedOrigin(request, config);
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    throw new ApplicationError(
      405,
      'METHOD_NOT_ALLOWED',
      'Method not allowed',
      'Mutations require a write method.',
    );
  }
  const supplied = request.headers.get('x-csrf-token') ?? '';
  const expected = createCsrfToken(sessionToken, config);
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    throw new ApplicationError(
      403,
      'INVALID_CSRF',
      'Request rejected',
      'Refresh the page and retry the request.',
    );
  }
}

export async function readBoundedJson(request: Request, maximumBytes = 16_384): Promise<unknown> {
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  ) {
    throw new ApplicationError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Unsupported request',
      'Send an application/json request.',
    );
  }
  const reader = request.body?.getReader();
  let bytes = 0;
  // Retain one byte-budgeted buffer, not one object per untrusted stream chunk.
  // Geometric growth bounds allocations even for millions of one-byte chunks.
  let body = Buffer.alloc(Math.min(maximumBytes, 16_384));
  if (reader) {
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        const nextBytes = bytes + next.value.byteLength;
        if (nextBytes > maximumBytes) {
          await reader.cancel();
          throw new ApplicationError(
            413,
            'INPUT_TOO_LARGE',
            'Request too large',
            'The request exceeds the input limit.',
          );
        }
        if (next.value.byteLength === 0) continue;
        if (nextBytes > body.length) {
          const capacity = Math.min(maximumBytes, Math.max(body.length * 2, nextBytes));
          const expanded = Buffer.alloc(capacity);
          body.copy(expanded, 0, 0, bytes);
          body = expanded;
        }
        body.set(next.value, bytes);
        bytes = nextBytes;
      }
    } finally {
      reader.releaseLock();
    }
  }
  let value: unknown;
  try {
    value = JSON.parse(body.toString('utf8', 0, bytes) || '{}');
  } catch {
    throw new ApplicationError(400, 'INVALID_JSON', 'Invalid request', 'Send valid JSON.');
  }
  assertBoundedJsonDepth(value);
  return value;
}
