import type { WorkspaceResponse } from '@journal/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspacePreferences } from '../../apps/web/src/components/workspace-preferences.js';

const { get, patch, refresh } = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('../../apps/web/src/lib/api-client.js', () => ({ apiClient: { GET: get, PATCH: patch } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const workspace: WorkspaceResponse = {
  id: '8820f573-4b2e-4497-b1c0-7427190620c1',
  name: 'Personal workspace',
  role: 'owner',
  isDemo: false,
  timezone: 'UTC',
  reportingCurrency: null,
  revision: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({
    response: new Response(null, {
      status: 200,
      headers: { 'x-csrf-token': 'test-session-proof' },
    }),
  });
});

function submitPreferences(timezone = 'Europe/Madrid', currency = 'eur') {
  fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: timezone } });
  fireEvent.change(screen.getByLabelText('Reporting currency'), { target: { value: currency } });
  fireEvent.submit(screen.getByRole('button', { name: 'Save preferences' }).closest('form')!);
}

describe('workspace preference foundation', () => {
  it('renders existing preferences without edit controls for a viewer', () => {
    render(<WorkspacePreferences workspace={{ ...workspace, role: 'viewer' }} />);
    expect(screen.getByText('UTC')).toBeVisible();
    expect(screen.getByText('Not selected')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save preferences' })).not.toBeInTheDocument();
  });

  it('validates the timezone before making any mutation request', async () => {
    render(<WorkspacePreferences workspace={workspace} />);
    submitPreferences('Invalid/Timezone');
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid timezone.');
    expect(get).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it('sends an uppercase label, source revision and in-memory session proof', async () => {
    patch.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      data: { ...workspace, timezone: 'Europe/Madrid', reportingCurrency: 'EUR', revision: 2 },
    });
    render(<WorkspacePreferences workspace={workspace} />);
    submitPreferences();
    expect(await screen.findByRole('status')).toHaveTextContent('Preferences saved.');
    expect(patch).toHaveBeenCalledWith('/api/v1/workspaces/{workspaceId}', {
      params: {
        path: { workspaceId: workspace.id },
        header: { 'X-CSRF-Token': 'test-session-proof' },
      },
      body: { timezone: 'Europe/Madrid', reportingCurrency: 'EUR', expectedRevision: 1 },
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('keeps a concurrent-edit conflict visible until preferences are reloaded', async () => {
    patch.mockResolvedValue({ response: new Response(null, { status: 409 }), data: undefined });
    render(<WorkspacePreferences workspace={workspace} />);
    submitPreferences();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'These preferences changed elsewhere. Reload them before saving again.',
    );
    expect(screen.getByLabelText('Timezone')).toHaveValue('Europe/Madrid');
    fireEvent.click(screen.getByRole('button', { name: 'Reload preferences' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it('does not mutate without an authenticated session proof', async () => {
    get.mockResolvedValue({ response: new Response(null, { status: 200 }) });
    render(<WorkspacePreferences workspace={workspace} />);
    submitPreferences();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session has ended. Sign in again to save these preferences.',
    );
    expect(patch).not.toHaveBeenCalled();
  });
});
