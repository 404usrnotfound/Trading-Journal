import { describe, expect, it } from 'vitest';
import { createImportServices } from '../../packages/server/src/imports/service.js';
import type { FinancialPlatform } from '../../packages/server/src/financial/repository.js';
import type { AuthorizationContext } from '@journal/server';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
describe('bounded import history metadata reads', () => {
  it('does not ask the driver for original files, mappings or preview rows, and retains the next-page cursor', async () => {
    const queries: string[] = [];
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: uuid(index + 1),
      accountId: uuid(99),
      namespace: 'fixture',
      filename: `${index}.csv`,
      fileHash: 'a'.repeat(64),
      adapterId: 'canonical-csv',
      adapterVersion: '1',
      revision: 2,
      state: 'staged',
      rowCount: 1000,
      createdAt: '2025-01-01T00:00:00Z',
    }));
    const platform = {
      withWorkspaceContext: async (
        _context: unknown,
        operation: (tx: unknown) => Promise<unknown>,
      ) =>
        operation({
          execute: async (query: unknown) => {
            queries.push(JSON.stringify(query));
            return { rows };
          },
        }),
    } as unknown as FinancialPlatform;
    const result = await createImportServices(platform).history({
      workspaceId: uuid(98),
    } as AuthorizationContext);
    expect(result.items).toHaveLength(50);
    expect(result.nextCursor).toBe(uuid(50));
    expect(queries).toHaveLength(1);
    expect(queries[0]).not.toContain('source_text');
    expect(queries[0]).not.toContain('mapping');
    expect(queries[0]).not.toContain('preview');
    expect(result.items[0]).not.toHaveProperty('preview');
    expect(result.items[0]).not.toHaveProperty('sourceText');
  });
});
