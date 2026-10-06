import { describe, expect, it } from 'vitest';
import { sessionResponseSchema, signInSchema, workspaceResponseSchema } from '@journal/contracts';

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
});
