import {
  canonicalImportDraftSchema,
  importKindSchema,
  type CanonicalImportDraft,
  type ImportMapping,
  type ImportRowResponse,
} from '@journal/contracts';
import { decimalValue, quantizeDecimal } from '@journal/domain';
import { parseCsv, normalizeDecimal, normalizeInstant, type CsvRow } from '../csv.js';

export type ParsedImportRow = {
  rowNumber: number;
  raw: Record<string, string>;
  draft: CanonicalImportDraft | null;
  errors: ImportRowResponse['errors'];
};
export type ImportAdapter = {
  id: string;
  version: string;
  name: string;
  parse(content: string, mapping: ImportMapping): ParsedImportRow[];
};
function assign(root: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.');
  let node: Record<string, unknown> | unknown[] = root;
  for (const [index, key] of keys.entries()) {
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      throw new Error('Unsafe target path.');
    if (Array.isArray(node) && !/^\d+$/u.test(key))
      throw new Error('Array paths need numeric indices.');
    if (/^\d+$/u.test(key) && Number(key) > 63) throw new Error('Array index exceeds 63.');
    if (index === keys.length - 1) {
      (node as Record<string, unknown>)[key] = value;
      return;
    }
    const next = keys[index + 1]!;
    const existing = (node as Record<string, unknown>)[key];
    if (existing !== undefined && (typeof existing !== 'object' || existing === null))
      throw new Error('Overlapping field targets.');
    (node as Record<string, unknown>)[key] ??= /^\d+$/u.test(next) ? [] : {};
    node = (node as Record<string, unknown>)[key] as Record<string, unknown>;
  }
}
function genericRow(row: CsvRow, mapping: ImportMapping): ParsedImportRow {
  const errors: ImportRowResponse['errors'] = [],
    payload: Record<string, unknown> = {},
    used = new Set<string>();
  let kind = mapping.kind;
  if (mapping.kindColumn) {
    used.add(mapping.kindColumn);
    const value = row.cells[mapping.kindColumn]?.trim();
    const found =
      value && mapping.kindValues && Object.hasOwn(mapping.kindValues, value)
        ? mapping.kindValues[value]
        : undefined;
    if (!found)
      errors.push({
        code: 'UNKNOWN_RECORD_KIND',
        message: 'Map this record type explicitly.',
        field: mapping.kindColumn,
      });
    else kind = found;
  }
  for (const field of mapping.fields) {
    if (field.kinds && !field.kinds.includes(kind)) continue;
    if (field.column) used.add(field.column);
    try {
      let value: unknown = field.column ? row.cells[field.column] : field.constant;
      if (field.column && value === undefined) throw new Error('Mapped column does not exist.');
      if (value === '') {
        if (field.empty === 'omit') continue;
        if (field.empty === 'null') {
          assign(payload, field.target, null);
          continue;
        }
        throw new Error('Required field is empty.');
      }
      if (typeof value === 'string') {
        let text = value;
        if (field.values) {
          const mapped = Object.hasOwn(field.values, text.trim())
            ? field.values[text.trim()]
            : undefined;
          if (mapped === undefined) throw new Error('Value needs an explicit mapping.');
          text = mapped;
        }
        switch (field.transform) {
          case 'text':
            value = text.trim();
            break;
          case 'decimal':
            value = normalizeDecimal(text, mapping.conventions);
            break;
          case 'negate_decimal':
            value = quantizeDecimal(
              decimalValue(normalizeDecimal(text, mapping.conventions)).negated(),
            );
            break;
          case 'instant':
            value = normalizeInstant(text, mapping.conventions);
            break;
          case 'boolean':
            if (!['true', 'false'].includes(text.trim()))
              throw new Error('Boolean values must map to true or false.');
            value = text.trim() === 'true';
            break;
          case 'json':
            value = JSON.parse(text);
            break;
          case 'reference': {
            const match = text.match(/^(.+):([a-zA-Z0-9.]+)$/u);
            if (!match) throw new Error('Reference must be sourceKey:result.path.');
            value = { $row: match[1], path: match[2] };
            break;
          }
        }
      }
      assign(payload, field.target, value);
    } catch (error) {
      errors.push({
        code: 'INVALID_FIELD',
        message: error instanceof Error ? error.message : 'Invalid value.',
        field: field.target,
      });
    }
  }
  for (const key of [mapping.sourceIdColumn, mapping.groupColumn, mapping.sourceKeyColumn])
    if (key) used.add(key);
  const sourceId = mapping.sourceIdColumn ? row.cells[mapping.sourceIdColumn]?.trim() : undefined;
  if (mapping.sourceIdColumn && !sourceId)
    errors.push({
      code: 'MISSING_SOURCE_ID',
      message: 'The selected broker ID column is empty.',
      field: mapping.sourceIdColumn,
    });
  const sourceKey = mapping.sourceKeyColumn
    ? row.cells[mapping.sourceKeyColumn]?.trim()
    : `${kind}:${sourceId || `row-${row.rowNumber}`}`;
  const groupKey = mapping.groupColumn ? row.cells[mapping.groupColumn]?.trim() : sourceKey;
  const warnings = Object.entries(row.cells)
    .filter(([key, value]) => value !== '' && !used.has(key))
    .map(([key]) => `Unmapped column retained in source: ${key}`);
  const result = canonicalImportDraftSchema.safeParse({
    sourceKey,
    sourceId,
    groupKey,
    kind: importKindSchema.parse(kind),
    payload,
    warnings,
  });
  if (!result.success)
    errors.push(
      ...result.error.issues.map((issue) => ({
        code: 'INVALID_CANONICAL_ROW',
        message: issue.message,
        field: issue.path.join('.'),
      })),
    );
  return {
    rowNumber: row.rowNumber,
    raw: row.cells,
    draft: result.success ? result.data : null,
    errors,
  };
}
export const genericCsvAdapter: ImportAdapter = {
  id: 'generic-csv',
  version: '1',
  name: 'Universal CSV mapping',
  parse: (content, mapping) =>
    parseCsv(content, mapping.conventions.delimiter).rows.map((row) => genericRow(row, mapping)),
};
/** Documented interchange sample, not a claim of compatibility with a named broker. */
export const canonicalCsvAdapter: ImportAdapter = {
  id: 'canonical-csv',
  version: '1',
  name: 'Canonical CSV interchange',
  parse: (content, mapping) =>
    parseCsv(content, mapping.conventions.delimiter).rows.map((row) => {
      try {
        const kind = importKindSchema.parse(row.cells.Kind),
          sourceId = row.cells.ID?.trim() || undefined;
        const sourceKey = row.cells.Key?.trim() || `${kind}:${sourceId || `row-${row.rowNumber}`}`;
        const draft = canonicalImportDraftSchema.parse({
          sourceKey,
          sourceId,
          groupKey: row.cells.Group?.trim() || sourceKey,
          kind,
          payload: JSON.parse(row.cells.Payload ?? ''),
          warnings: Object.keys(row.cells)
            .filter((key) => !['ID', 'Key', 'Kind', 'Group', 'Payload'].includes(key))
            .map((key) => `Unmapped column retained in source: ${key}`),
        });
        return { rowNumber: row.rowNumber, raw: row.cells, draft, errors: [] };
      } catch {
        return {
          rowNumber: row.rowNumber,
          raw: row.cells,
          draft: null,
          errors: [
            {
              code: 'INVALID_CANONICAL_CSV',
              message: 'Use the documented Kind and a valid JSON object in Payload.',
            },
          ],
        };
      }
    }),
};
/** Trusted server extensions only. Uploads can select registered adapters, never supply executable code. */
export class ImportAdapterRegistry {
  private readonly adapters = new Map<string, ImportAdapter>();
  constructor(adapters: readonly ImportAdapter[] = [genericCsvAdapter, canonicalCsvAdapter]) {
    for (const adapter of adapters) this.register(adapter);
  }
  register(adapter: ImportAdapter): void {
    const key = `${adapter.id}@${adapter.version}`;
    if (this.adapters.has(key)) throw new Error('Adapter identity/version already registered.');
    this.adapters.set(key, adapter);
  }
  get(id: string, version: string): ImportAdapter {
    const adapter = this.adapters.get(`${id}@${version}`);
    if (!adapter) throw new Error('This adapter/version is unavailable.');
    return adapter;
  }
  list() {
    return [...this.adapters.values()].map(({ id, version, name }) => ({ id, version, name }));
  }
}
