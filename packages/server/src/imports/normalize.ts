import { canonicalImportPayloadSchemas, type CanonicalImportDraft } from '@journal/contracts';
import { decimal, decimalValue } from '@journal/domain';
import { financialFingerprint } from '../financial/repository.js';
import { canonicalFinancialInstant } from '../financial/observations.js';
const monetaryFields = new Set([
  'amount',
  'price',
  'quantity',
  'rate',
  'sourceAmount',
  'destinationAmount',
  'entryPrice',
  'bookedPrincipal',
  'withholding',
  'multiplier',
  'quantityIncrement',
  'priceIncrement',
  'settlementIncrement',
  'limitPrice',
  'stopPrice',
  'ratio',
]);
export function normalizeImportPayload(value: unknown, key = '', depth = 0): unknown {
  if (depth > 12) throw new Error('Import payload nesting exceeds twelve levels.');
  if (typeof value === 'string' && monetaryFields.has(key))
    return decimal(decimalValue(value).toFixed());
  if (typeof value === 'string' && ['economicAt', 'observedAt', 'effectiveAt'].includes(key))
    return canonicalFinancialInstant(value);
  if (typeof value === 'string' && key.endsWith('Id') && /^[a-f0-9-]{36}$/iu.test(value))
    return value.toLowerCase();
  if (Array.isArray(value))
    return value.map((item) => normalizeImportPayload(item, key, depth + 1));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([name, child]) => {
        if (
          ['__proto__', 'prototype', 'constructor', 'commandId', 'sourceFingerprint'].includes(name)
        )
          throw new Error('Reserved field in import payload.');
        return [name, normalizeImportPayload(child, name, depth + 1)];
      }),
    );
  return value;
}
export function rowReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(rowReferences);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('$row' in record) {
      if (
        typeof record.$row !== 'string' ||
        typeof record.path !== 'string' ||
        Object.keys(record).length !== 2 ||
        record.path
          .split('.')
          .some((part) => ['__proto__', 'prototype', 'constructor'].includes(part))
      )
        throw new Error('Invalid local row reference.');
      return [record.$row];
    }
    return Object.values(record).flatMap(rowReferences);
  }
  return [];
}
export function validateDraft(
  draft: CanonicalImportDraft,
  accountId: string,
): CanonicalImportDraft {
  accountId = accountId.toLowerCase();
  let payload = normalizeImportPayload(draft.payload) as CanonicalImportDraft['payload'];
  if (['execution', 'opening_lot'].includes(draft.kind) && payload.costsComplete === undefined)
    payload.costsComplete = false;
  if ('sourceIdentity' in payload || 'commandId' in payload)
    throw new Error('Source identity and command IDs are assigned by the import framework.');
  const bound = [
    'cash_movement',
    'execution',
    'fee',
    'opening_lot',
    'order',
    'account_valuation',
    'income',
    'tax',
    'expense',
  ].includes(draft.kind);
  if (bound) {
    if (payload.accountId && payload.accountId !== accountId)
      throw new Error('A batch cannot write to another account.');
    payload.accountId = accountId;
  }
  if (!rowReferences(payload).length)
    payload = canonicalImportPayloadSchemas[draft.kind].parse(
      payload,
    ) as CanonicalImportDraft['payload'];
  return { ...draft, payload };
}
export function importIdentity(
  draft: CanonicalImportDraft,
  dependencies: ReadonlyMap<string, CanonicalImportDraft> = new Map(),
  dependencyHashes: Map<string, string> = new Map(),
): {
  identityKey: string;
  payloadHash: string;
} {
  function economicReferences(value: unknown, visited: ReadonlySet<string>, depth = 0): unknown {
    if (depth > 24) throw new Error('Import dependency nesting exceeds twenty-four levels.');
    if (Array.isArray(value))
      return value.map((child) => economicReferences(child, visited, depth + 1));
    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if ('$row' in record) {
        const key = String(record.$row),
          dependency = dependencies.get(key);
        if (!dependency) throw new Error(`Missing local dependency: ${key}.`);
        if (visited.has(key)) throw new Error('Circular import dependency.');
        let dependencyPayloadHash = dependencyHashes.get(key);
        if (!dependencyPayloadHash) {
          dependencyPayloadHash = financialFingerprint({
            version: 'canonical-import/1',
            kind: dependency.kind,
            payload: economicReferences(dependency.payload, new Set([...visited, key]), depth + 1),
          });
          dependencyHashes.set(key, dependencyPayloadHash);
        }
        return {
          dependencyKind: dependency.kind,
          dependencySourceId: dependency.sourceId ?? null,
          dependencyPayloadHash,
          resultPath: record.path,
        };
      }
      return Object.fromEntries(
        Object.entries(record).map(([key, child]) => [
          key,
          economicReferences(child, visited, depth + 1),
        ]),
      );
    }
    return value;
  }
  const payloadHash = financialFingerprint({
    version: 'canonical-import/1',
    kind: draft.kind,
    payload: economicReferences(draft.payload, new Set([draft.sourceKey])),
  });
  return {
    payloadHash,
    identityKey: draft.sourceId ? `id:${draft.sourceId}` : `fp:1:${payloadHash}`,
  };
}
export function resolveReferences(value: unknown, results: Map<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveReferences(item, results));
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('$row' in record) {
      let result = results.get(String(record.$row));
      for (const key of String(record.path).split('.')) {
        if (['__proto__', 'prototype', 'constructor'].includes(key))
          throw new Error('Unsafe reference path.');
        result =
          result !== null && typeof result === 'object' && Object.hasOwn(result, key)
            ? (result as Record<string, unknown>)[key]
            : undefined;
      }
      if (typeof result !== 'string')
        throw new Error(
          `Unresolved reference to ${String(record.$row)}.${String(record.path)}. Include its dependency group or map an existing identity.`,
        );
      return result;
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, child]) => [key, resolveReferences(child, results)]),
    );
  }
  return value;
}
