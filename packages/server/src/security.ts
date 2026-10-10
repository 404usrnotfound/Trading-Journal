import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ServerConfig } from './config.js';
import { ApplicationError } from './errors.js';

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
  const chunks: Uint8Array[] = [];
  if (reader) {
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > maximumBytes) {
          await reader.cancel();
          throw new ApplicationError(
            413,
            'INPUT_TOO_LARGE',
            'Request too large',
            'The request exceeds the input limit.',
          );
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new ApplicationError(400, 'INVALID_JSON', 'Invalid request', 'Send valid JSON.');
  }
}
