import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSafeSession, verifyReadiness } = vi.hoisted(() => ({
  getSafeSession: vi.fn(),
  verifyReadiness: vi.fn(),
}));
vi.mock('@journal/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@journal/server')>()),
  getSafeSession,
  verifyReadiness,
}));

import { ApplicationError } from '@journal/server';
import { GET } from '../../apps/web/src/app/api/v1/health/ready/route.js';

const request = () => new Request('http://localhost/api/v1/health/ready');
beforeEach(() => {
  vi.resetAllMocks();
  getSafeSession.mockResolvedValue({ user: { id: 'readiness-test' } });
  verifyReadiness.mockResolvedValue({ status: 'ready', database: 'connected', schema: 'current' });
});

describe('protected application readiness', () => {
  it('keeps healthy anonymous callers unauthorized and does not check schema for them', async () => {
    getSafeSession.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(verifyReadiness).not.toHaveBeenCalled();
  });

  it.each([401, 403])('preserves an explicit authentication rejection (%i)', async (status) => {
    getSafeSession.mockRejectedValue(
      new ApplicationError(status, 'ACCESS_REJECTED', 'Rejected', 'Rejected'),
    );
    expect((await GET(request())).status).toBe(status);
    expect(verifyReadiness).not.toHaveBeenCalled();
  });

  it('returns 503 without revealing failed authentication connection details', async () => {
    getSafeSession.mockRejectedValue(
      new Error('postgresql://operator:readiness-private@database/secret'),
    );
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.code).toBe('NOT_READY');
    expect(body.requestId).toBe(response.headers.get('x-request-id'));
    expect(JSON.stringify(body)).not.toMatch(/readiness-private|postgresql|operator|secret/);
    expect(verifyReadiness).not.toHaveBeenCalled();
  });

  it('checks authenticated dependencies and retains safe unavailability', async () => {
    verifyReadiness.mockRejectedValue(
      new ApplicationError(503, 'NOT_READY', 'Service unavailable', 'The service is not ready.'),
    );
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('NOT_READY');
  });

  it('returns only safe schema/database readiness and no-store for an authenticated caller', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      status: 'ready',
      database: 'connected',
      schema: 'current',
    });
  });
});
