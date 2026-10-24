import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceResponse } from '@journal/contracts';
import { PortabilityWorkspace } from '../../apps/web/src/components/portability/portability-workspace.js';

const source = '00000000-0000-4000-8000-000000000001';
const target = '00000000-0000-4000-8000-000000000002';
const workspace: WorkspaceResponse = {
  id: source,
  name: 'Private records',
  role: 'owner',
  isDemo: false,
  timezone: 'UTC',
  reportingCurrency: 'USD',
  revision: 1,
};

describe('workspace portability confirmations', () => {
  it('reuses one restore command after a committed response is lost', async () => {
    const writes: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === '/api/auth/session')
          return new Response('{}', { headers: { 'x-csrf-token': 'session-proof' } });
        writes.push(init!);
        if (writes.length === 1) throw new TypeError('Response lost');
        return Response.json(
          {
            workspaceId: target,
            name: 'Private records restored',
            sourceWorkspaceId: source,
            archiveSha256: 'a'.repeat(64),
            verified: true,
          },
          { status: 201 },
        );
      }),
    );
    render(<PortabilityWorkspace workspace={workspace} />);
    const file = Object.assign(
      new File(['{}'], 'private.journal.json', { type: 'application/json' }),
      { text: async () => '{}' },
    );
    fireEvent.change(screen.getByLabelText('Workspace backup JSON'), { target: { files: [file] } });
    const confirm = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Review restore' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Restore and verify' }));
    };
    await confirm();
    await screen.findByRole('alert');
    expect(writes).toHaveLength(1);
    await confirm();
    await waitFor(() =>
      expect(screen.getByText('The new workspace was restored and verified.')).toBeVisible(),
    );
    expect(writes).toHaveLength(2);
    expect(writes[1]?.body).toBe(writes[0]?.body);
    expect(new Headers(writes[1]?.headers).get('idempotency-key')).toBe(
      new Headers(writes[0]?.headers).get('idempotency-key'),
    );
    expect(new Headers(writes[1]?.headers).get('x-csrf-token')).toBe('session-proof');
    expect(screen.getByRole('link', { name: 'Open restored workspace' })).toHaveAttribute(
      'href',
      `/accounts?workspace=${target}`,
    );
  });

  it('offers filtered exports while reserving full backup and restore for owners', () => {
    render(<PortabilityWorkspace workspace={{ ...workspace, role: 'viewer' }} />);
    expect(
      screen.queryByRole('button', { name: 'Download workspace backup' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review restore' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export selected records' })).toBeEnabled();
  });
});
