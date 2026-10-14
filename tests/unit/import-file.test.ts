import { describe, expect, it, vi } from 'vitest';
import { IMPORT_LIMITS } from '@journal/contracts';
import { readImportFile } from '../../apps/web/src/components/imports/import-file.js';

describe('untrusted import-file decoding', () => {
  it('preserves a BOM, CRLF and non-ASCII text as the exact accepted UTF-8 bytes', async () => {
    const source = '\uFEFFID,Note\r\nD1,"café 東京"\r\n';
    const bytes = new TextEncoder().encode(source);
    const text = await readImportFile({
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.buffer,
    });
    expect(text).toBe(source);
    expect(new TextEncoder().encode(text)).toEqual(bytes);
  });

  it.each([
    [0xc3, 0x28],
    [0xe2, 0x82],
    [0xc0, 0xaf],
    [0xed, 0xa0, 0x80],
  ])(
    'rejects malformed UTF-8 bytes %j instead of retaining replacement characters',
    async (...raw) => {
      const bytes = Uint8Array.from([0x49, 0x44, 0x0a, ...raw]);
      await expect(
        readImportFile({ size: bytes.byteLength, arrayBuffer: async () => bytes.buffer }),
      ).rejects.toThrow('Choose a CSV encoded as valid UTF-8. The source has not been staged.');
    },
  );

  it('accepts the exact file limit and rejects excess size before allocating a read buffer', async () => {
    const bytes = new TextEncoder().encode('x'.repeat(IMPORT_LIMITS.fileBytes));
    await expect(
      readImportFile({ size: bytes.byteLength, arrayBuffer: async () => bytes.buffer }),
    ).resolves.toHaveLength(IMPORT_LIMITS.fileBytes);
    const arrayBuffer = vi.fn(async () => bytes.buffer);
    await expect(
      readImportFile({ size: IMPORT_LIMITS.fileBytes + 1, arrayBuffer }),
    ).rejects.toThrow('Choose a CSV up to 2 MiB.');
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
