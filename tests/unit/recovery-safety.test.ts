import { describe, expect, it } from 'vitest';
import {
  assertOwnedRecoveryDatabase,
  compareRecoverySnapshots,
  recoveryComposeProjectName,
  recoveryDigest,
  validateRecoveryRoles,
} from '../../scripts/operations/recovery-safety.js';

describe('isolated operational recovery safety', () => {
  const generated = `journal_recovery_${'a'.repeat(32)}_test`;
  it('resolves default and isolated CI Compose projects and rejects invalid selectors', () => {
    expect(recoveryComposeProjectName(undefined)).toBe('trading-journal-foundation');
    expect(recoveryComposeProjectName('journal-ci-123456-2')).toBe('journal-ci-123456-2');
    for (const invalid of ['', 'Journal', 'local,remote', '--all', 'project\nother', 'a=b'])
      expect(() => recoveryComposeProjectName(invalid)).toThrow();
  });

  it('requires both the generated test name and invocation ownership', () => {
    expect(() => assertOwnedRecoveryDatabase(generated, new Set([generated]))).not.toThrow();
    for (const name of ['trading_journal', 'trading_journal_test', generated, `${generated};DROP`])
      expect(() => assertOwnedRecoveryDatabase(name, new Set())).toThrow();
    expect(() =>
      assertOwnedRecoveryDatabase('trading_journal_test', new Set(['trading_journal_test'])),
    ).toThrow();
  });

  it('detects monetary digits beyond the JavaScript safe-number envelope', () => {
    const before = '{"amount":9007199254740993.000000000000000001}';
    const changed = '{"amount":9007199254740993.000000000000000002}';
    expect(recoveryDigest(before)).not.toBe(recoveryDigest(changed));
    expect(() =>
      compareRecoverySnapshots({ hash: recoveryDigest(before) }, { hash: recoveryDigest(changed) }),
    ).toThrow();
    expect(() =>
      compareRecoverySnapshots({ hash: recoveryDigest(before) }, { hash: recoveryDigest(before) }),
    ).not.toThrow();
  });

  it('rejects privilege escalation, missing roles and inherited memberships before restore', () => {
    const roles = ['journal_app', 'journal_auth', 'journal_jobs', 'journal_migrator'].map(
      (rolname) => ({
        rolname,
        rolcanlogin: rolname !== 'journal_migrator',
        rolinherit: false,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolbypassrls: rolname === 'journal_migrator',
        rolreplication: false,
      }),
    );
    expect(() => validateRecoveryRoles(roles, 0)).not.toThrow();
    expect(() => validateRecoveryRoles(roles, 1)).toThrow();
    expect(() => validateRecoveryRoles(roles.slice(1), 0)).toThrow();
    expect(() =>
      validateRecoveryRoles(
        roles.map((role) => ({ ...role, rolbypassrls: true })),
        0,
      ),
    ).toThrow();
    expect(() =>
      validateRecoveryRoles(
        roles.map((role) => ({ ...role, rolsuper: true })),
        0,
      ),
    ).toThrow();
    expect(() =>
      validateRecoveryRoles(
        roles.map((role) => ({ ...role, rolreplication: true })),
        0,
      ),
    ).toThrow();
  });
});
