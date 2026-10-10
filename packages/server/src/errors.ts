import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';

export class ApplicationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly title: string,
    public readonly detail: string,
  ) {
    super(title);
    this.name = 'ApplicationError';
  }
}

export function toProblemResponse(error: unknown, requestId: string = randomUUID()): Response {
  const problem =
    error instanceof ApplicationError
      ? { status: error.status, code: error.code, title: error.title, detail: error.detail }
      : error instanceof ZodError
        ? {
            status: 400,
            code: 'INVALID_REQUEST',
            title: 'Invalid request',
            detail: 'The request does not match the expected format.',
          }
        : {
            status: 500,
            code: 'INTERNAL_ERROR',
            title: 'Request failed',
            detail: 'The request could not be completed.',
          };
  return new Response(JSON.stringify({ type: 'about:blank', ...problem, requestId }), {
    status: problem.status,
    headers: {
      'content-type': 'application/problem+json',
      'cache-control': 'no-store',
      'x-request-id': requestId,
    },
  });
}

export function unauthenticated(): ApplicationError {
  return new ApplicationError(401, 'UNAUTHENTICATED', 'Sign in required', 'Sign in to continue.');
}

export function inaccessible(): ApplicationError {
  return new ApplicationError(
    404,
    'NOT_FOUND',
    'Not found',
    'The requested resource is unavailable.',
  );
}
