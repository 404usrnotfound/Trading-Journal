import { describe, expect, it } from 'vitest';
import { FINANCIAL_CALCULATION_MANIFEST } from '@journal/domain';
import { DATABASE_SCHEMA_VERSION } from '@journal/database';
import { PORTABLE_FORMAT, portableExportRequestSchema } from '@journal/contracts';
import { csvCell, serializeExport } from '../../packages/server/src/portability/exports.js';
import {
  portableHash,
  rebindWorkspace,
  validateArchive,
} from '../../packages/server/src/portability/integrity.js';
const source = '00000000-0000-4000-8000-000000000001',
  target = '00000000-0000-4000-8000-000000000002';
function archive() {
  const value = {
    format: PORTABLE_FORMAT,
    schemaVersion: DATABASE_SCHEMA_VERSION,
    calculationManifest: FINANCIAL_CALCULATION_MANIFEST,
    sourceWorkspace: {
      id: source,
      name: 'Fixture',
      timezone: 'UTC',
      reportingCurrency: null,
      createdAt: '2025-01-01T00:00:00Z',
    },
    exportedAt: '2025-01-01T00:00:00Z',
    tables: [],
    media: [],
    verification: { cash: [] },
  };
  return { ...value, sha256: portableHash(value) };
}
describe('portable archive validation and spreadsheet-safe record presentations', () => {
  it('retains exact JSON values while CSV neutralizes leading spreadsheet formulas and quotes fields', () => {
    for (const input of [
      '=HYPERLINK("https://example.test","open")',
      ' +SUM(1,2)',
      '\t@SUM(A1)',
      '-1+2',
      '\r=1',
    ])
      expect(csvCell(input)).toMatch(/^"'/u);
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    const rows = [{ title: '=1+2', quantity: '0.123456789123456789', fee: '-0.01' }];
    const result = serializeExport({ kind: 'trades', format: 'json' }, rows);
    expect(JSON.parse(result.body).rows).toEqual(rows);
    expect(serializeExport({ kind: 'trades', format: 'csv' }, rows).body).toContain('"\'=1+2"');
  });
  it('rejects unknown record collections and checksum/version changes instead of importing hidden permissions', () => {
    expect(validateArchive(archive()).format).toBe(PORTABLE_FORMAT);
    const changed = { ...archive(), schemaVersion: DATABASE_SCHEMA_VERSION + 1 };
    expect(() => validateArchive(changed)).toThrow('Workspace archive rejected');
    const unknown = {
      ...archive(),
      tables: [{ name: 'workspace_memberships', rows: [], sha256: portableHash([]) }],
    };
    unknown.sha256 = portableHash(
      Object.fromEntries(Object.entries(unknown).filter(([key]) => key !== 'sha256')),
    );
    expect(() => validateArchive(unknown)).toThrow('Workspace archive rejected');
  });
  it('bounds recursive input and detects missing private-media bytes before restore', () => {
    let nested: unknown = {};
    for (let depth = 0; depth < 60; depth++) nested = { child: nested };
    expect(() => validateArchive(nested)).toThrow('Workspace archive rejected');
    const value = {
      ...archive(),
      tables: [
        {
          name: 'strategy_attachments',
          rows: [
            { workspace_id: source, id: target, state: 'ready', size: 3, sha256: 'f'.repeat(64) },
          ],
          sha256: '',
        },
      ],
    };
    value.tables[0]!.sha256 = portableHash(value.tables[0]!.rows);
    value.sha256 = portableHash(
      Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'sha256')),
    );
    expect(() => validateArchive(value)).toThrow('Workspace archive rejected');
  });
  it('rebinds explicit workspace references while retaining source identities, text and opaque actors', () => {
    expect(
      rebindWorkspace(
        {
          workspace_id: source,
          actor_id: 'old-actor',
          payload: { scope: { workspaceId: source }, note: source, sourceId: source },
        },
        source,
        target,
      ),
    ).toEqual({
      workspace_id: target,
      actor_id: 'old-actor',
      payload: { scope: { workspaceId: target }, note: source, sourceId: source },
    });
  });
  it('requires a typed complete analytics context and rejects unknown export request fields', () => {
    expect(
      portableExportRequestSchema.safeParse({ kind: 'analytics', format: 'json' }).success,
    ).toBe(false);
    expect(
      portableExportRequestSchema.safeParse({ kind: 'trades', format: 'json', sql: 'SELECT *' })
        .success,
    ).toBe(false);
  });
});
