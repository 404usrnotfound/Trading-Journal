import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignOutButton } from '../../apps/web/src/components/sign-out-button.js';
import type { WorkspaceNavigationRequestDetail } from '../../apps/web/src/components/ux/navigation-request.js';

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
  it('keeps the draft, session and private query state when fallback confirmation is canceled', async () => {
    const guard = (event: Event) => event.preventDefault();
    window.addEventListener('journal:navigation-request', guard);
    try {
      const client = renderSignOut();
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
      expect(get).not.toHaveBeenCalled();
      expect(post).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
      expect(client.getQueryCache().getAll()).toHaveLength(1);
      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByRole('heading', { name: 'Sign out with unsaved work?' }),
      ).toBeVisible();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(get).not.toHaveBeenCalled();
      expect(post).not.toHaveBeenCalled();
      expect(client.getQueryCache().getAll()).toHaveLength(1);
    } finally {
      window.removeEventListener('journal:navigation-request', guard);
    }
  });
  it('lets explicit fallback confirmation sign out an expired session despite an unsavable draft', async () => {
    const guard = (event: Event) => event.preventDefault();
    window.addEventListener('journal:navigation-request', guard);
    try {
      get.mockResolvedValue({ response: new Response(null, { status: 200 }), data: null });
      const client = renderSignOut();
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
      const dialog = await screen.findByRole('dialog');
      expect(get).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Discard and sign out' }));
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/sign-in'));
      expect(get).toHaveBeenCalledOnce();
      expect(post).not.toHaveBeenCalled();
      expect(client.getQueryCache().getAll()).toHaveLength(0);
    } finally {
      window.removeEventListener('journal:navigation-request', guard);
    }
  });
  it('defers to a guard-owned confirmation instead of opening a second dialog', async () => {
    let continuation: (() => void) | undefined;
    const guard = (event: Event) => {
      event.preventDefault();
      const detail = (event as CustomEvent<WorkspaceNavigationRequestDetail>).detail;
      detail.handled = true;
      continuation = detail.continue;
    };
    window.addEventListener('journal:navigation-request', guard);
    try {
      get.mockResolvedValue({ response: new Response(null, { status: 200 }), data: null });
      const client = renderSignOut();
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(get).not.toHaveBeenCalled();
      expect(continuation).toBeTypeOf('function');
      await act(async () => continuation?.());
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/sign-in'));
      expect(get).toHaveBeenCalledOnce();
      expect(client.getQueryCache().getAll()).toHaveLength(0);
    } finally {
      window.removeEventListener('journal:navigation-request', guard);
    }
  });
  it('preserves private state and guard confirmation when a confirmed logout request fails', async () => {
    const guard = (event: Event) => event.preventDefault();
    window.addEventListener('journal:navigation-request', guard);
    try {
      get.mockRejectedValue(new Error('Session lookup failed'));
      const client = renderSignOut();
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
      fireEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'Discard and sign out',
        }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent('Unable to sign out');
      expect(replace).not.toHaveBeenCalled();
      expect(client.getQueryCache().getAll()).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
      expect(await screen.findByRole('dialog')).toBeVisible();
      expect(get).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('journal:navigation-request', guard);
    }
  });
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
