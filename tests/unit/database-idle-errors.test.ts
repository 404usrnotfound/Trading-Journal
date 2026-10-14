import { describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@journal/database';

describe('database idle connection failures', () => {
  it('handles a client-bearing error immediately and emits only a fixed safe diagnostic', async () => {
    const secret = 'SYNTHETIC_DATABASE_IDLE_ERROR_PASSWORD';
    const connectionString = `postgres://synthetic:${secret}@localhost/synthetic_idle_review_test`;
    const database = createDatabase(connectionString);
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const client = {
        connectionParameters: { password: secret, connectionString },
        password: secret,
      };
      const failure = Object.assign(new Error(`Raw driver error ${connectionString}`), {
        code: `UNTRUSTED_${secret}`,
        client,
      });
      expect(() => database.pool.emit('error', failure, client)).not.toThrow();
      const captured = write.mock.calls.map(([value]) => String(value)).join('');
      expect(captured).toBe('{"event":"database.idle-connection-failed"}\n');
      expect(JSON.parse(captured)).toEqual({ event: 'database.idle-connection-failed' });
      for (const privateValue of [secret, connectionString, failure.message, failure.stack!]) {
        expect(captured).not.toContain(privateValue);
      }
    } finally {
      write.mockRestore();
      await database.close();
    }
  });

  it('keeps the idle-error listener non-throwing when its diagnostic sink throws', async () => {
    const database = createDatabase(
      'postgres://synthetic:synthetic@localhost/synthetic_idle_review_test',
    );
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => {
      throw new Error('diagnostic sink failed');
    });
    try {
      expect(() => database.pool.emit('error', new Error('idle failure'))).not.toThrow();
      expect(write).toHaveBeenCalledOnce();
    } finally {
      write.mockRestore();
      await database.close();
    }
  });
});
