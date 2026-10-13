import { describe, it, expect } from 'vitest';
import { importMappingSchema, importStageSchema } from '@journal/contracts';
import {
  parseCsv,
  normalizeDecimal,
  normalizeInstant,
} from '../../packages/server/src/imports/csv.js';
import {
  ImportAdapterRegistry,
  genericCsvAdapter,
} from '../../packages/server/src/imports/adapters/registry.js';
import {
  validateDraft,
  importIdentity,
  resolveReferences,
} from '../../packages/server/src/imports/normalize.js';
const account = '00000000-0000-4000-8000-000000000001',
  currency = '00000000-0000-4000-8000-000000000002';
const conventions = importMappingSchema.parse({
  kind: 'cash_movement',
  fields: [{ target: 'amount', column: 'Amount', transform: 'decimal' }],
}).conventions;
const mapping = () =>
  importMappingSchema.parse({
    kind: 'cash_movement',
    sourceIdColumn: 'ID',
    fields: [
      { target: 'amount', column: 'Amount', transform: 'decimal' },
      { target: 'currencyId', constant: currency },
      { target: 'kind', constant: 'deposit' },
      { target: 'economicAt', column: 'Date', transform: 'instant' },
      { target: 'orderingKey', constant: '1' },
    ],
  });
describe('bounded broker-independent CSV boundary', () => {
  it('retains quoted delimiters, escaped quotes, multiline cells, BOM and physical source row numbers', () => {
    const parsed = parseCsv(
      '\uFEFFID,Note\r\na,"one,two"\r\nb,"say ""hello""\nnext"\r\nc,end\r\n',
      ',',
    );
    expect(parsed.headers).toEqual(['ID', 'Note']);
    expect(parsed.rows).toEqual([
      { rowNumber: 2, cells: { ID: 'a', Note: 'one,two' } },
      { rowNumber: 3, cells: { ID: 'b', Note: 'say "hello"\nnext' } },
      { rowNumber: 5, cells: { ID: 'c', Note: 'end' } },
    ]);
  });
  it.each(['ID,ID\na,b', 'ID,Note\na', 'ID\n"unclosed', 'ID\na"x', '__proto__\na', 'ID\n\0'])(
    'rejects malformed/unsafe input without truncation: %s',
    (text) => expect(() => parseCsv(text, ',')).toThrow(),
  );
  it('rejects limits for rows, columns, fields and UTF-8 bytes', () => {
    expect(() => parseCsv('ID\n' + 'a\n'.repeat(1001), ',')).toThrow(/1,000/);
    expect(() =>
      parseCsv(
        Array.from({ length: 65 }, (_, i) => `c${i}`).join(',') + '\n' + 'x,'.repeat(64) + 'x',
        ',',
      ),
    ).toThrow(/64/);
    expect(() => parseCsv('ID\n' + 'a'.repeat(16385), ',')).toThrow(/16 KiB/);
    expect(() => parseCsv('ID\n' + 'x'.repeat(2097152), ',')).toThrow(/2 MiB/);
  });
  it('does exact decimal normalization with explicit grouping and no floating/exponent coercion', () => {
    const eu = { ...conventions, decimalSeparator: ',' as const, thousandsSeparator: '.' as const };
    expect(normalizeDecimal('1.234,567890123456789123456789', eu)).toBe(
      '1234.567890123456789123456789',
    );
    expect(normalizeDecimal('-000.10', conventions)).toBe('-0.1');
    expect(() => normalizeDecimal('1.23,45', eu)).toThrow();
    expect(() => normalizeDecimal('1,23', conventions)).toThrow();
    expect(() => normalizeDecimal('=2+3', conventions)).toThrow();
    expect(() => normalizeDecimal('1e-5', conventions)).toThrow();
  });
  it('retains microseconds and explicit ISO offsets, rejecting impossible calendar dates', () => {
    expect(normalizeInstant('2026-10-12T13:00:00.123456+02:00', conventions)).toBe(
      '2026-10-12T11:00:00.123456Z',
    );
    expect(() => normalizeInstant('2026-02-30T00:00:00Z', conventions)).toThrow();
    expect(() => normalizeInstant('2026-10-12T13:00:00', conventions)).toThrow(/offset/);
  });
  it('normalizes explicit local conventions and refuses DST gaps or ambiguous folds', () => {
    const madrid = { ...conventions, dateFormat: 'dmy' as const, timezone: 'Europe/Madrid' };
    expect(normalizeInstant('12/10/2026 13:00:00.000001', madrid)).toBe(
      '2026-10-12T11:00:00.000001Z',
    );
    expect(() => normalizeInstant('29/03/2026 02:30:00', madrid)).toThrow(/Nonexistent/);
    expect(() => normalizeInstant('25/10/2026 02:30:00', madrid)).toThrow(/Ambiguous/);
  });
  it('requires distinct separators, unique safe targets and exactly one mapping source', () => {
    expect(() =>
      importMappingSchema.parse({
        ...mapping(),
        conventions: { ...conventions, decimalSeparator: ',', thousandsSeparator: ',' },
      }),
    ).toThrow();
    expect(() =>
      importMappingSchema.parse({
        ...mapping(),
        fields: [{ target: '__proto__.x', column: 'ID' }],
      }),
    ).toThrow();
    expect(() =>
      importMappingSchema.parse({
        ...mapping(),
        fields: [{ target: 'amount', column: 'Amount', constant: '1' }],
      }),
    ).toThrow();
    expect(() =>
      importStageSchema.parse({
        accountId: account,
        namespace: 'broker',
        filename: 'x.csv',
        content: 'x\ny',
        mapping: mapping(),
        templateVersionId: account,
      }),
    ).toThrow();
  });
});
describe('adapter contract and canonical identities', () => {
  it('parses per-row errors, retains unmapped notes, and normalizes before fingerprinting', () => {
    const parsed = genericCsvAdapter.parse(
      'ID,Amount,Date,Note\nA,001.00,2026-10-12T00:00:00Z,"=SUM(A1)"\nB,bad,2026-10-12T00:00:00Z,note',
      mapping(),
    );
    const first = validateDraft(parsed[0]!.draft!, account);
    expect(first.payload.amount).toBe('1');
    expect(first.warnings).toContain('Unmapped column retained in source: Note');
    expect(parsed[0]!.raw.Note).toBe('=SUM(A1)');
    expect(parsed[1]!.errors[0]?.field).toBe('amount');
    expect(importIdentity(first)).toEqual(
      importIdentity({ ...first, payload: { ...first.payload, amount: '1' } }),
    );
    expect(importIdentity(first).identityKey).toBe('id:A');
  });
  it('fallback identity depends on normalized economics rather than filename, row index or column order', () => {
    const first = validateDraft(
      genericCsvAdapter.parse('ID,Amount,Date\nA,1.00,2026-10-12T00:00:00Z', mapping())[0]!.draft!,
      account,
    );
    const noId = { ...first, sourceId: undefined };
    const identity = importIdentity(noId);
    expect(identity.identityKey).toMatch(/^fp:1:[a-f0-9]{64}$/);
    expect(
      importIdentity({ ...noId, sourceKey: 'different-row', groupKey: 'different-group' }),
    ).toEqual(identity);
    expect(importIdentity({ ...noId, payload: { ...noId.payload, amount: '2' } })).not.toEqual(
      identity,
    );
  });
  it('does not let a parser override account, command identity or inject executable/prototype data', () => {
    const row = genericCsvAdapter.parse('ID,Amount,Date\nA,1,2026-10-12T00:00:00Z', mapping())[0]!
      .draft!;
    expect(() =>
      validateDraft({ ...row, payload: { ...row.payload, accountId: currency } }, account),
    ).toThrow(/another account/);
    expect(() =>
      validateDraft({ ...row, payload: { ...row.payload, commandId: account } }, account),
    ).toThrow(/Reserved/);
    expect(() =>
      validateDraft({ ...row, payload: JSON.parse('{"__proto__":{"x":1}}') }, account),
    ).toThrow(/Reserved/);
  });
  it('resolves explicit local identities without traversing inherited properties', () => {
    const results = new Map([['instrument:ABC', { version: { id: currency } }]]);
    expect(
      resolveReferences(
        { instrumentVersionId: { $row: 'instrument:ABC', path: 'version.id' } },
        results,
      ),
    ).toEqual({ instrumentVersionId: currency });
    expect(() =>
      resolveReferences({ id: { $row: 'instrument:ABC', path: 'constructor.name' } }, results),
    ).toThrow();
    expect(() => resolveReferences({ id: { $row: 'missing', path: 'id' } }, results)).toThrow(
      /Unresolved/,
    );
  });
  it('adds a documented independent adapter without touching any financial domain handler', () => {
    const registry = new ImportAdapterRegistry();
    registry.register({
      id: 'documented-example',
      version: '1',
      name: 'Documented example',
      parse: (content, config) =>
        genericCsvAdapter.parse(content.replace('Transaction ID', 'ID'), config),
    });
    expect(
      registry
        .get('documented-example', '1')
        .parse('Transaction ID,Amount,Date\nA,1,2026-10-12T00:00:00Z', mapping())[0]!.draft
        ?.sourceId,
    ).toBe('A');
    expect(() => registry.get('documented-example', '2')).toThrow();
    expect(() => registry.register(genericCsvAdapter)).toThrow();
  });
});
