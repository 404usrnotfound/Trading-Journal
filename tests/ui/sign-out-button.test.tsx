import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignOutButton } from '../../apps/web/src/components/sign-out-button.js';

const { get, post, replace, refresh } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('../../apps/web/src/lib/api-client.js', () => ({ apiClient: { GET: get, POST: post } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }));

const session = {
  user: { id: 'user-fixture', name: 'Test owner', email: 'owner@example.test' },
  expiresAt: '2030-01-01T00:00:00Z',
};

beforeEach(() => vi.clearAllMocks());

function renderSignOut() {
  const client = new QueryClient();
  client.setQueryData(['workspace', 'test-scope'], { name: 'Private workspace' });
  render(
    <QueryClientProvider client={client}>
      <SignOutButton />
    </QueryClientProvider>,
  );
  return client;
}

describe('sign-out session boundary', () => {
  it('obtains a session proof before logout and clears private browser query state', async () => {
    get.mockResolvedValue({
      response: new Response(null, {
        status: 200,
        headers: { 'x-csrf-token': 'test-session-proof' },
      }),
      data: session,
    });
    post.mockResolvedValue({ response: new Response(null, { status: 200 }), data: { ok: true } });
    const client = renderSignOut();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/sign-in'));
    expect(post).toHaveBeenCalledWith('/api/auth/sign-out', {
      params: { header: { 'X-CSRF-Token': 'test-session-proof' } },
      body: {},
    });
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('clears stale browser data when the persisted session has already expired', async () => {
    get.mockResolvedValue({ response: new Response(null, { status: 200 }), data: null });
    const client = renderSignOut();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/sign-in'));
    expect(post).not.toHaveBeenCalled();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it('does not claim logout when the active session lacks its mutation proof', async () => {
    get.mockResolvedValue({ response: new Response(null, { status: 200 }), data: session });
    const client = renderSignOut();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to sign out. Please try again.',
    );
    expect(post).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(client.getQueryCache().getAll()).toHaveLength(1);
  });
});
