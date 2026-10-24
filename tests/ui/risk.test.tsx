import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceResponse } from '@journal/contracts';
import { RiskWorkspace } from '../../apps/web/src/components/risk/risk-workspace.js';
vi.mock('../../apps/web/src/components/strategies/strategy-api.js', () => ({
  sessionProof: async () => 'risk-fixture-csrf',
}));
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const workspace: WorkspaceResponse = {
  id: uuid(1),
  name: 'Risk workspace',
  role: 'owner',
  isDemo: false,
  timezone: 'Europe/Madrid',
  reportingCurrency: 'EUR',
  revision: 1,
};
const instant = '2026-01-05T12:00:00.000001Z';
const definitions: Record<string, unknown> = {
  accounts: [{ id: uuid(2), label: 'Source account' }],
  currencies: [{ id: uuid(3), label: 'EUR · Euro' }],
  instruments: [{ id: uuid(4), label: 'Source stock v1' }],
  'strategy-versions': [{ id: uuid(5), label: 'Source strategy v1' }],
  strategies: [{ id: uuid(6), label: 'Source strategy' }],
  'fx-observations': [],
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const renderRisk = (role: WorkspaceResponse['role'] = 'owner') =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <RiskWorkspace workspace={{ ...workspace, role }} />
    </QueryClientProvider>,
  );
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
let writes: { path: string; body: Record<string, unknown>; key: string | null }[];
beforeEach(() => {
  writes = [];
  window.history.replaceState(null, '', '/risk');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname.endsWith('/catalog'))
        return json({
          items: definitions[url.searchParams.get('collection')!] ?? [],
          nextCursor: null,
        });
      if (url.pathname.endsWith('/policies') && !init?.method)
        return json({ versions: [], nextCursor: null });
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      writes.push({
        path: url.pathname,
        body,
        key: new Headers(init?.headers).get('idempotency-key'),
      });
      if (url.pathname.endsWith('/policies'))
        return json({
          id: uuid(11),
          policyId: uuid(12),
          workspaceId: workspace.id,
          accountId: body.accountId,
          strategyId: body.strategyId,
          version: 1,
          effectiveAt: body.effectiveAt,
          createdAt: instant,
          actorId: 'fixture-owner',
          reason: body.reason,
          definition: body.definition,
        });
      if (url.pathname.endsWith('/assessments'))
        return json({
          id: uuid(20),
          accountId: body.accountId,
          strategyVersionId: body.strategyVersionId,
          asOf: body.asOf,
          createdAt: instant,
          actorId: 'fixture-owner',
          sourceRevision: '7',
          definitionVersion: 'risk-assessment/1',
          state: 'unknown',
          policies: [],
          proposal: body.proposal,
          results: [
            {
              policyVersionId: uuid(11),
              limit: {
                id: uuid(13),
                kind: 'trade-risk',
                maximum: '10',
                currencyId: uuid(3),
                measure: 'amount',
              },
              fact: {
                value: null,
                unit: 'money',
                currencyId: uuid(3),
                reasons: ['record_explicit_proposed_risk_amount_currency_and_method'],
                references: ['financial-revision:7'],
              },
              state: 'unknown',
              explanation:
                'Record explicit proposed risk amount, currency and method; no zero was substituted.',
            },
          ],
        });
      if (url.pathname.endsWith('/sizing'))
        return json({
          state: 'unknown',
          quantity: null,
          plannedRisk: null,
          riskPerUnit: null,
          budget: '100',
          currencyId: uuid(3),
          reasons: ['unsupported_linear_sizing_use_explicit_manual_risk'],
          mode: 'linear',
          definitionVersion: 'planned-stop-risk/1',
          references: [uuid(4)],
          warning: 'Planned stop risk does not guarantee the realized loss.',
        });
      throw new Error(`Unexpected request ${url.pathname}`);
    }),
  );
});
describe('risk policy, assessment and sizing workflows', () => {
  it('publishes explicit typed limits and immutable source/calendar settings without invented capital', async () => {
    renderRisk();
    await screen.findByRole('option', { name: 'Source account' });
    change('Policy name', 'Reviewed account risk');
    change('Policy scope reference', uuid(2));
    change('Effective instant', instant);
    change('Change reason', 'Reviewed independent policy');
    change('Maximum observation age in milliseconds', '300000');
    change('Limit kind', 'positions');
    change('Configured maximum', '3');
    fireEvent.click(screen.getByRole('button', { name: 'Add configured limit' }));
    expect(screen.getByText('positions', { selector: 'strong' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Publish policy version' }));
    await screen.findByText(/Published Reviewed account risk version 1/);
    expect(writes[0]!.body).toMatchObject({
      expectedVersion: 0,
      accountId: uuid(2),
      strategyId: null,
      reason: 'Reviewed independent policy',
      definition: {
        name: 'Reviewed account risk',
        maxAgeMilliseconds: 300000,
        limits: [{ kind: 'positions', maximum: 3 }],
        priceSources: ['manual'],
        fxSources: ['manual'],
      },
    });
    expect(writes[0]!.key).toMatch(/^[a-f0-9-]{36}$/u);
    expect(JSON.stringify(writes[0]!.body)).not.toContain('capital');
  });
  it('shows missing assessment evidence as unknown and provides a stored assessment address', async () => {
    renderRisk();
    fireEvent.click(screen.getByRole('button', { name: 'Assess risk' }));
    await screen.findByRole('option', { name: 'Source account' });
    change('Assessment account', uuid(2));
    change('Assessment instant', instant);
    fireEvent.click(screen.getByRole('button', { name: 'Capture risk assessment' }));
    await screen.findByRole('heading', { name: 'Assessment: unknown' });
    expect(screen.getByText(/Observed: Unknown money/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Permanent assessment record' })).toHaveAttribute(
      'href',
      `/risk?workspace=${workspace.id}&assessment=${uuid(20)}`,
    );
    expect(writes[0]!.body).toMatchObject({
      accountId: uuid(2),
      strategyVersionId: null,
      proposal: null,
    });
  });
  it('requires explicit budget/costs and preserves the unsupported manual fallback explanation', async () => {
    renderRisk();
    fireEvent.click(screen.getByRole('button', { name: 'Size a trade' }));
    await screen.findByRole('option', { name: 'Source account' });
    change('Sizing account', uuid(2));
    change('Sizing instrument version', uuid(4));
    change('Sizing risk currency', uuid(3));
    change('Planning instant', instant);
    change('Explicit risk budget', '100');
    change('Estimated fixed costs in risk currency', '0');
    change('Estimated costs per quantity unit in risk currency', '0');
    change('Maximum planning FX age in milliseconds', '0');
    change('Entry price', '100');
    change('Adverse stop price', '95');
    fireEvent.click(screen.getByRole('button', { name: 'Calculate planned size' }));
    await screen.findByRole('heading', { name: 'Sizing: unknown' });
    expect(screen.getByText(/Quantity: Unavailable/)).toBeInTheDocument();
    expect(
      screen.getByText('unsupported linear sizing use explicit manual risk'),
    ).toBeInTheDocument();
    expect(writes[0]!.body).toMatchObject({
      budget: '100',
      fixedCosts: '0',
      perUnitCosts: '0',
      fxObservationId: null,
    });
    change('Sizing method', 'manual');
    expect(
      screen.getByLabelText('Scenario or max-loss method and evidence', { exact: true }),
    ).toBeInTheDocument();
  });
  it('leaves policy and assessment publishing disabled for a viewer while sizing remains accessible', async () => {
    renderRisk('viewer');
    expect(screen.getByRole('button', { name: 'Publish policy version' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Assess risk' }));
    expect(screen.getByRole('button', { name: 'Capture risk assessment' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Size a trade' }));
    expect(screen.getByRole('button', { name: 'Calculate planned size' })).toBeEnabled();
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Source account' })).toBeInTheDocument(),
    );
  });
});
