'use client';

import { sessionProof } from '../strategies/strategy-api';

export class JournalApiError extends Error {
  constructor(public readonly status: number) {
    super(
      status === 409
        ? 'Another change was saved first. Your draft is preserved. Review the latest version before replacing your draft.'
        : status === 401
          ? 'Your session has ended. Sign in again to continue.'
          : status === 403
            ? 'Your workspace role does not allow this action.'
            : status === 422
              ? 'Check the journal fields and their workspace references before saving.'
              : status === 413
                ? 'The submitted document or attachment is too large.'
                : 'The request could not be completed. Your draft is preserved; retry when your connection is available.',
    );
    this.name = 'JournalApiError';
  }
}

export async function journalRead<Value>(
  url: string,
  schema: { parse(value: unknown): Value },
): Promise<Value> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new JournalApiError(response.status);
  return schema.parse(await response.json());
}

export async function journalWrite<Value>(
  url: string,
  method: 'POST' | 'PUT',
  body: unknown,
  schema: { parse(value: unknown): Value },
  commandId: string,
): Promise<Value> {
  const proof = await sessionProof();
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': proof,
      'Idempotency-Key': commandId,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new JournalApiError(response.status);
  return schema.parse(await response.json());
}

export function journalErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The journal request could not be completed.';
}
