'use client';

import { sessionProof } from '../strategies/strategy-api';
import { problemResponseSchema } from '@journal/contracts';

async function readFailure(response: Response) {
  if (response.status === 401) return 'Your session has ended. Sign in again to continue.';
  if (response.status === 403) return 'Your workspace role does not allow this action.';
  if (response.status === 404)
    return 'The selected record is unavailable. Reload the reference records and choose again.';
  const problem = problemResponseSchema.safeParse(await response.json().catch(() => null));
  if (problem.success && problem.data.code === 'SOURCE_NOT_EFFECTIVE')
    return 'This execution was corrected. Reload recorded executions and select its effective replacement; no new cash should be booked.';
  return 'The financial records could not be loaded. Try again.';
}

export async function recordRead<Value>(url: string, schema: { parse(value: unknown): Value }) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error(await readFailure(response));
  return schema.parse(await response.json());
}

export async function recordWrite<Value>(
  url: string,
  body: unknown,
  schema: { parse(value: unknown): Value },
  commandId: string,
) {
  const proof = await sessionProof();
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': proof,
      'Idempotency-Key': commandId,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 401)
      throw new Error('Your session has ended. Sign in again to continue.');
    if (response.status === 403) throw new Error('Your workspace role does not allow this action.');
    if (response.status === 409)
      throw new Error(
        'The current inventory or allocation changed. Review the recorded execution before trying a new command.',
      );
    if (response.status === 400 || response.status === 422) {
      const problem = problemResponseSchema.safeParse(await response.json().catch(() => null));
      if (
        problem.success &&
        [
          'INVALID_FINANCIAL_INPUT',
          'INVALID_FINANCIAL_REFERENCE',
          'UNSUPPORTED_OPERATION',
        ].includes(problem.data.code)
      )
        throw new Error(`${problem.data.detail} Review the source fields before retrying.`);
      throw new Error(
        'The source values or instrument conventions do not permit this operation. Check the fields and selected account.',
      );
    }
    throw new Error(
      'The response was interrupted. Keep this page open and retry the same record; its command identifiers are retained.',
    );
  }
  return schema.parse(await response.json());
}

/** The same logical command retains its identity after a lost response. */
export function retainedCommand(
  commands: Map<string, { serialized: string; id: string }>,
  key: string,
  body: unknown,
) {
  const serialized = JSON.stringify(body);
  const previous = commands.get(key);
  if (previous?.serialized === serialized) return previous.id;
  const id = crypto.randomUUID();
  commands.set(key, { serialized, id });
  return id;
}
