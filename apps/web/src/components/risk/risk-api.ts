import { problemResponseSchema } from '@journal/contracts';
import { sessionProof } from '../strategies/strategy-api';
export async function riskWrite<T>(
  url: string,
  body: unknown,
  schema: { parse(value: unknown): T },
  commandId: string,
): Promise<T> {
  const proof = await sessionProof();
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': proof,
        'idempotency-key': commandId,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      'The risk response was interrupted. Retry on this page; the same command identity is retained.',
    );
  }
  if (!response.ok) {
    if (response.status === 401) throw new Error('Your session ended. Sign in again to continue.');
    if (response.status === 403)
      throw new Error('Your workspace role does not permit this risk action.');
    const problem = problemResponseSchema.safeParse(await response.json().catch(() => null));
    throw new Error(
      problem.success
        ? `${problem.data.detail} No new risk result was shown.`
        : 'The risk action failed. Check the fields and retry; no new result was shown.',
    );
  }
  try {
    return schema.parse(await response.json());
  } catch {
    throw new Error(
      'The risk response could not be validated. Retry on this page before publishing another command.',
    );
  }
}
