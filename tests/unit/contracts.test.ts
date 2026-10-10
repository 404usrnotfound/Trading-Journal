import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  sessionResponseSchema,
  signInSchema,
  workspaceResponseSchema,
  workspacePreferencesUpdateSchema,
  changePasswordSchema,
  revokeSessionSchema,
  safeSessionListResponseSchema,
} from '@journal/contracts';

describe('public foundation contracts', () => {
  it('rejects auth session secrets and internal fields instead of serializing them', () => {
    expect(
      sessionResponseSchema.safeParse({
        user: { id: 'user', name: 'User', email: 'user@example.test' },
        expiresAt: '2026-10-06T12:00:00Z',
        token: 'not-a-public-field',
      }).success,
    ).toBe(false);
    expect(sessionResponseSchema.parse(null)).toBeNull();
  });
  it('validates sign-in input without accepting ownership fields', () => {
    expect(signInSchema.safeParse({ email: 'invalid', password: '' }).success).toBe(false);
    expect(
      signInSchema.safeParse({ email: 'user@example.test', password: 'value', role: 'owner' })
        .success,
    ).toBe(false);
  });
  it('validates password changes and session revocation without accepting server ownership', () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'present', newPassword: 'too-short' })
        .success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'present',
        newPassword: 'a-new-test-password',
        userId: 'a-different-actor',
      }).success,
    ).toBe(false);
    expect(revokeSessionSchema.safeParse({ sessionId: '', userId: 'another-actor' }).success).toBe(
      false,
    );
    expect(revokeSessionSchema.parse({ sessionId: 'safe-session-identifier' })).toEqual({
      sessionId: 'safe-session-identifier',
    });
  });
  it('exposes safe session-management identifiers without accepting tokens or network metadata', () => {
    const session = {
      id: 'safe-session-identifier',
      createdAt: '2026-10-10T12:00:00Z',
      expiresAt: '2026-10-11T12:00:00Z',
      current: true,
    };
    expect(safeSessionListResponseSchema.parse({ sessions: [session] })).toEqual({
      sessions: [session],
    });
    for (const sensitive of ['token', 'ipAddress', 'userAgent', 'userId'])
      expect(
        safeSessionListResponseSchema.safeParse({
          sessions: [{ ...session, [sensitive]: 'a-private-field' }],
        }).success,
      ).toBe(false);
  });
  it('requires a valid scoped workspace identity and defined role', () => {
    expect(
      workspaceResponseSchema.safeParse({
        id: 'wrong',
        name: 'Workspace',
        role: 'administrator',
        isDemo: false,
      }).success,
    ).toBe(false);
  });

  it('requires explicit revision and actual updates, rejecting ownership fields and offset timezones', () => {
    for (const input of [
      { expectedRevision: 1 },
      { timezone: 'Europe/Madrid' },
      { timezone: 'Europe/Madrid', expectedRevision: 0 },
      { timezone: '+01:00', expectedRevision: 1 },
      { timezone: 'Unknown/Timezone', expectedRevision: 1 },
      { reportingCurrency: 'eur', expectedRevision: 1 },
      { reportingCurrency: 'USD', expectedRevision: 1, role: 'owner' },
      { timezone: 'Europe/Madrid', expectedRevision: 1, workspaceId: 'client-chosen-owner' },
    ])
      expect(workspacePreferencesUpdateSchema.safeParse(input).success).toBe(false);
    expect(
      workspacePreferencesUpdateSchema.parse({
        timezone: 'Europe/Madrid',
        reportingCurrency: null,
        expectedRevision: 1,
      }),
    ).toEqual({ timezone: 'Europe/Madrid', reportingCurrency: null, expectedRevision: 1 });
    expect(
      workspacePreferencesUpdateSchema.parse({ reportingCurrency: 'USDT', expectedRevision: 2 }),
    ).toEqual({ reportingCurrency: 'USDT', expectedRevision: 2 });
  });

  it('preserves arbitrary user-facing text through JSON round trips and rejects extra nested fields', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.uuid(), (name, id) => {
        const session = {
          user: { id, name, email: 'user@example.test' },
          expiresAt: '2026-10-10T12:00:00Z',
        };
        const serialized = JSON.stringify(sessionResponseSchema.parse(session));
        expect(sessionResponseSchema.parse(JSON.parse(serialized))).toEqual(session);
        expect(
          sessionResponseSchema.safeParse({
            ...session,
            user: { ...session.user, token: 'a-private-auth-field' },
          }).success,
        ).toBe(false);
      }),
      { numRuns: 100, seed: 20261010 },
    );
  });
});
