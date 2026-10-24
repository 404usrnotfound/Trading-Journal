import { problemResponseSchema } from '@journal/contracts';
import { sessionProof } from '../strategies/strategy-api';
export class ReviewSaveError extends Error {
  constructor(
    message: string,
    readonly outcome: 'unknown' | 'rejected',
  ) {
    super(message);
  }
}
export async function reviewRead<T>(url: string, schema: { parse(value: unknown): T }): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? 'Your session ended. Sign in again.'
        : 'The review record could not be loaded. Check workspace access and retry.',
    );
  return schema.parse(await response.json());
}
export async function reviewWrite<T>(
  url: string,
  body: unknown,
  schema: { parse(value: unknown): T },
  commandId: string,
): Promise<T> {
  const csrf = await sessionProof();
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrf,
        'idempotency-key': commandId,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ReviewSaveError(
      'The save response was interrupted. Your draft remains here; retry the retained command before editing further.',
      'unknown',
    );
  }
  if (!response.ok) {
    const problem = problemResponseSchema.safeParse(await response.json().catch(() => null));
    throw new ReviewSaveError(
      problem.success
        ? problem.data.detail
        : response.status === 401
          ? 'Your session ended. Sign in again; keep this draft available.'
          : 'The review could not be saved. Keep this draft and retry.',
      response.status >= 500 || response.status === 408 ? 'unknown' : 'rejected',
    );
  }
  try {
    return schema.parse(await response.json());
  } catch {
    throw new ReviewSaveError(
      'The saved response was incomplete. Keep this draft and retry the retained command before editing further.',
      'unknown',
    );
  }
}
