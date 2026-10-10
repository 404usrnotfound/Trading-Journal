import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safeServerQuery } from '../../apps/web/src/lib/server-query.js';

const { failure, redirect, notFound, MockApplicationError } = vi.hoisted(() => {
  class MockApplicationError extends Error {
    constructor(public status: number) {
      super('Safe application failure');
    }
  }
  return {
    failure: vi.fn(),
    redirect: vi.fn(() => {
      throw new Error('NEXT_REDIRECT');
    }),
    notFound: vi.fn(() => {
      throw new Error('NEXT_NOT_FOUND');
    }),
    MockApplicationError,
  };
});
vi.mock('@journal/server', () => ({ ApplicationError: MockApplicationError }));
vi.mock('next/navigation', () => ({ redirect, notFound }));
vi.mock('../../apps/web/src/lib/api-response.js', () => ({ apiFailure: failure }));
beforeEach(() => vi.clearAllMocks());

describe('server page query boundary', () => {
  it('returns the authorized query result without altering it', async () => {
    const result = { workspace: 'authorized-fixture' };
    await expect(safeServerQuery('workspace.read', async () => result)).resolves.toBe(result);
    expect(failure).not.toHaveBeenCalled();
  });

  it('logs through the safe API boundary and replaces unexpected diagnostics without a cause', async () => {
    const diagnostic = new Error('SQL parameter contains fixture-private-content');
    const result = safeServerQuery('workspace.read', async () => {
      throw diagnostic;
    });
    await expect(result).rejects.toMatchObject({
      message: 'The page request could not be completed.',
    });
    await result.catch((error: unknown) => {
      expect(error).not.toBe(diagnostic);
      expect(error).not.toHaveProperty('cause');
    });
    expect(failure).toHaveBeenCalledWith(diagnostic, 'workspace.read');
  });

  it('preserves inaccessible-object and expired-session framework navigation', async () => {
    await expect(
      safeServerQuery('workspace.read', async () => {
        throw new MockApplicationError(404);
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalledOnce();
    await expect(
      safeServerQuery('session.read', async () => {
        throw new MockApplicationError(401);
      }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/sign-in');
  });
});
