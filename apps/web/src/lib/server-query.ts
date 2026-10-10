import { ApplicationError } from '@journal/server';
import { notFound, redirect } from 'next/navigation';
import { apiFailure } from './api-response';

type PageQuery = 'session.read' | 'workspace.list' | 'workspace.read';

/** Keep SQL diagnostics and private source values out of Next's default error logger. */
export async function safeServerQuery<T>(
  operation: PageQuery,
  query: () => Promise<T>,
): Promise<T> {
  try {
    return await query();
  } catch (error) {
    apiFailure(error, operation);
    if (error instanceof ApplicationError) {
      if (error.status === 401) redirect('/sign-in');
      if (error.status === 403 || error.status === 404) notFound();
    }
    // Deliberately omit the original error and cause; diagnostics were safely recorded above.
    throw new Error('The page request could not be completed.');
  }
}
