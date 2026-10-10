import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from '@journal/server/logging';
import { ApplicationError, toProblemResponse } from '@journal/server';

describe('safe logs and public problems', () => {
  it('retains correlation fields and drops secrets, raw errors and source data', () => {
    const chunks: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(String(chunk));
        done();
      },
    });
    const logger = createLogger({ destination });
    logger.error(
      {
        operation: 'auth.gateway',
        requestId: 'request-safe',
        password: 'password-to-hide',
        token: 'token-to-hide',
        source: 'source-to-hide',
        arbitrary: 'arbitrary-to-hide',
        err: new Error('postgres://user:sql-secret@localhost/db'),
      },
      'Authentication request rejected',
    );
    logger.error({ err: new Error('automatic-message-secret') });
    logger.error(new Error('bare-error-secret'));
    const output = chunks.join('');
    expect(output).toContain('request-safe');
    expect(output).toContain('auth.gateway');
    for (const secret of [
      'password-to-hide',
      'token-to-hide',
      'source-to-hide',
      'arbitrary-to-hide',
      'sql-secret',
      'automatic-message-secret',
      'bare-error-secret',
    ])
      expect(output).not.toContain(secret);
  });

  it('never exposes unexpected exception text in an RFC 9457 problem', async () => {
    const response = toProblemResponse(
      new Error('password=private; SELECT secret FROM auth.account'),
      'request-one',
    );
    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    const body = await response.json();
    expect(body.requestId).toBe('request-one');
    expect(JSON.stringify(body)).not.toContain('private');
    expect(JSON.stringify(body)).not.toContain('SELECT');
    expect(
      (
        await toProblemResponse(
          new ApplicationError(
            404,
            'NOT_FOUND',
            'Not found',
            'The requested resource is unavailable.',
          ),
        ).json()
      ).code,
    ).toBe('NOT_FOUND');
  });
});
