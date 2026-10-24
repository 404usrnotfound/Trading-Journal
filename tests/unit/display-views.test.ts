import { describe, expect, it } from 'vitest';
import {
  defaultDisplayViewSettings,
  displayViewSettingsSchema,
  displayViewWriteSchema,
} from '../../packages/contracts/src/display-views.js';
const id = '00000000-0000-4000-8000-000000000001';
const journalFilters = {
  search: 'review',
  status: 'open',
  includeArchived: 'false',
  period: 'today',
  from: '',
  to: '',
  accountId: '',
};
describe('typed private display settings', () => {
  it('preserves required identities and rejects unknown/duplicate columns, cross-screen filters and unknown executable fields', () => {
    expect(defaultDisplayViewSettings('dashboard').columns).toContain('title');
    for (const columns of [[], ['status'], ['title', 'title'], ['title', 'unknown']])
      expect(
        displayViewSettingsSchema.safeParse({ screen: 'journal', columns, views: [] }).success,
      ).toBe(false);
    const state = {
      screen: 'journal',
      columns: ['title'],
      views: [{ id, name: 'Review', filters: journalFilters }],
    };
    expect(displayViewSettingsSchema.parse(state)).toEqual(state);
    expect(displayViewSettingsSchema.safeParse({ ...state, screen: 'strategies' }).success).toBe(
      false,
    );
    expect(
      displayViewSettingsSchema.safeParse({ ...state, script: 'javascript:alert(1)' }).success,
    ).toBe(false);
  });
  it('requires unique case-insensitive view names, valid scoped filter shapes and bounded versioned snapshots', () => {
    const view = { id, name: 'Review', filters: journalFilters },
      state = { screen: 'journal', columns: ['title'], views: [view] };
    expect(
      displayViewSettingsSchema.safeParse({
        ...state,
        views: [view, { ...view, id: '00000000-0000-4000-8000-000000000002', name: 'REVIEW' }],
      }).success,
    ).toBe(false);
    expect(
      displayViewSettingsSchema.safeParse({
        ...state,
        views: [
          {
            ...view,
            filters: { ...journalFilters, period: 'custom', from: '2026-10-24', to: '2026-10-01' },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      displayViewWriteSchema.safeParse({ expectedRevision: -1, settings: state }).success,
    ).toBe(false);
    expect(displayViewWriteSchema.parse({ expectedRevision: 0, settings: state }).settings).toEqual(
      state,
    );
  });
});
