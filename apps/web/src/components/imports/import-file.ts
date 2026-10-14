import { IMPORT_LIMITS } from '@journal/contracts';

/** Decode accepted UTF-8 evidence losslessly; never substitute bytes or discard its BOM. */
export async function readImportFile(file: Pick<File, 'size' | 'arrayBuffer'>): Promise<string> {
  if (file.size > IMPORT_LIMITS.fileBytes) throw new Error('Choose a CSV up to 2 MiB.');
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error('Choose a CSV encoded as valid UTF-8. The source has not been staged.');
  }
}
