'use client';

import { apiClient } from '@/lib/api-client';

export class StrategyApiError extends Error {
  constructor(public readonly status: number) {
    super(
      status === 409
        ? 'This record changed or cannot accept this action. Reload the latest version before trying again.'
        : status === 401
          ? 'Your session has ended. Sign in again to continue.'
          : status === 403
            ? 'Your workspace role does not allow this action.'
            : status === 413
              ? 'Choose a file no larger than 10 MiB.'
              : status === 422
                ? 'The submitted fields are invalid or reference unavailable workspace records.'
                : 'The request could not be completed. Check your connection and try again.',
    );
    this.name = 'StrategyApiError';
  }
}

export async function strategyRead<Value>(
  url: string,
  schema: { parse(value: unknown): Value },
): Promise<Value> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new StrategyApiError(response.status);
  return schema.parse(await response.json());
}

export async function sessionProof(): Promise<string> {
  const result = await apiClient.GET('/api/auth/session');
  const proof = result.response.headers.get('x-csrf-token');
  if (!result.response.ok || !proof) throw new StrategyApiError(401);
  return proof;
}

export async function strategyWrite<Value>(
  url: string,
  method: 'POST' | 'PUT' | 'DELETE',
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
  if (!response.ok) throw new StrategyApiError(response.status);
  return schema.parse(await response.json());
}

export function strategyErrorMessage(error: unknown): string {
  return error instanceof StrategyApiError
    ? error.message
    : 'The request could not be completed. Check your connection and try again.';
}
