import { IMPORT_LIMITS, importJsonInputIssue, type ImportMapping } from '@journal/contracts';
import { decimal, decimalValue } from '@journal/domain';

export type CsvRow = { rowNumber: number; cells: Record<string, string> };
/** Inspect before recursive validation or record cloning can discard a reserved source key. */
export function assertImportJsonNesting(value: unknown): void {
  const issue = importJsonInputIssue(value);
  if (issue) throw new Error(issue);
}
export function parseImportJson(text: string): unknown {
  const value: unknown = JSON.parse(text);
  assertImportJsonNesting(value);
  return value;
}
export function parseCsv(
  content: string,
  delimiter: string,
): { headers: string[]; rows: CsvRow[] } {
  if (new TextEncoder().encode(content).byteLength > IMPORT_LIMITS.fileBytes)
    throw new Error('CSV exceeds the 2 MiB file limit.');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(content))
    throw new Error('CSV contains binary/control data. Use UTF-8 text.');
  if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(content))
    throw new Error('CSV must be valid UTF-8 text.');
  const input = content.replace(/^\uFEFF/u, ''),
    records: { line: number; values: string[] }[] = [];
  let values: string[] = [],
    cell = '',
    quoted = false,
    closed = false,
    atStart = true,
    line = 1,
    start = 1;
  const field = () => {
    if (new TextEncoder().encode(cell).byteLength > IMPORT_LIMITS.fieldBytes)
      throw new Error(`Field on line ${start} exceeds 16 KiB.`);
    values.push(cell);
    if (values.length > IMPORT_LIMITS.columns) throw new Error('CSV exceeds 64 columns.');
    cell = '';
    closed = false;
    atStart = true;
  };
  const row = () => {
    field();
    if (values.some((value) => value !== '')) records.push({ line: start, values });
    values = [];
    start = line + 1;
    if (records.length > IMPORT_LIMITS.rows + 1) throw new Error('CSV exceeds 1,000 data rows.');
  };
  for (let index = 0; index < input.length; index++) {
    const char = input[index]!;
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        cell += char;
        if (char === '\n') line++;
      }
      continue;
    }
    if (char === delimiter) {
      field();
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index++;
      row();
      line++;
      continue;
    }
    if (closed) {
      if (char === ' ' || char === '\t') continue;
      throw new Error(`Unexpected text after quoted field on line ${line}.`);
    }
    if (char === '"') {
      if (!atStart) throw new Error(`Quote inside an unquoted field on line ${line}.`);
      quoted = true;
      atStart = false;
      continue;
    }
    cell += char;
    atStart = false;
  }
  if (quoted) throw new Error(`Unclosed quoted field on line ${start}.`);
  if (cell !== '' || values.length || closed) row();
  const header = records.shift();
  if (!header) throw new Error('CSV needs a header and data rows.');
  const headers = header.values.map((value) => value.trim());
  if (
    headers.some(
      (value) =>
        !value || value.length > 160 || ['__proto__', 'constructor', 'prototype'].includes(value),
    ) ||
    new Set(headers).size !== headers.length
  )
    throw new Error('CSV headers must be nonempty, unique safe names.');
  if (!records.length) throw new Error('CSV has no data rows.');
  const rows = records.map((record) => {
    if (record.values.length !== headers.length)
      throw new Error(
        `Line ${record.line} has ${record.values.length} columns; expected ${headers.length}.`,
      );
    return {
      rowNumber: record.line,
      cells: Object.fromEntries(headers.map((name, index) => [name, record.values[index]!])),
    };
  });
  return { headers, rows };
}
export function normalizeDecimal(text: string, conventions: ImportMapping['conventions']): string {
  let value = text.trim();
  const decimalSeparator = conventions.decimalSeparator,
    group = conventions.thousandsSeparator;
  const parts = value.split(decimalSeparator);
  if (parts.length > 2) throw new Error('More than one decimal separator.');
  const integral = parts[0]!;
  if (group !== 'none' && integral.includes(group)) {
    const escaped = group.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    if (!new RegExp(`^[+-]?\\d{1,3}(?:${escaped}\\d{3})+$`, 'u').test(integral))
      throw new Error('Invalid thousands grouping.');
    parts[0] = integral.split(group).join('');
  }
  value = parts.join('.');
  if (!/^[+-]?\d+(?:\.\d+)?$/u.test(value))
    throw new Error('Use the configured decimal/grouping convention; no exponents or expressions.');
  return decimalValue(value).isZero() ? '0' : decimal(decimalValue(value).toFixed());
}
function utcMillis(parts: number[]): number {
  const date = new Date(0);
  date.setUTCFullYear(parts[0]!, parts[1]! - 1, parts[2]!);
  date.setUTCHours(parts[3]!, parts[4]!, parts[5]!, 0);
  return date.getTime();
}
export function normalizeInstant(text: string, conventions: ImportMapping['conventions']): string {
  if (conventions.dateFormat === 'iso') {
    const match = text
      .trim()
      .match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/u);
    if (!match)
      throw new Error(
        'ISO timestamps need seconds, at most six fractional digits and an explicit offset.',
      );
    const date = new Date(`${match[1]}T${match[2]}${match[4]}`);
    if (!Number.isFinite(date.getTime())) throw new Error('Invalid ISO timestamp.');
    // Validate the wall-clock calendar too; Date.parse otherwise accepts February 30.
    const calendar = match[1]!.split('-').map(Number),
      clock = match[2]!.split(':').map(Number);
    const wall = new Date(utcMillis([...calendar, ...clock]));
    if (
      wall.getUTCFullYear() !== calendar[0] ||
      wall.getUTCMonth() + 1 !== calendar[1] ||
      wall.getUTCDate() !== calendar[2] ||
      clock[0]! > 23 ||
      clock[1]! > 59 ||
      clock[2]! > 59
    )
      throw new Error('Invalid calendar date/time.');
    return date.toISOString().replace(/\.\d{3}Z$/u, `.${(match[3] ?? '').padEnd(6, '0')}Z`);
  }
  const match = text
    .trim()
    .match(
      /^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?)?$/u,
    );
  if (!match) throw new Error('Use the selected date format, optionally with HH:mm:ss.');
  const a = Number(match[1]),
    b = Number(match[2]),
    c = Number(match[3]);
  const calendar =
    conventions.dateFormat === 'ymd'
      ? [a, b, c]
      : conventions.dateFormat === 'dmy'
        ? [c, b, a]
        : [c, a, b];
  const parts = [...calendar, Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0)];
  const wall = utcMillis(parts),
    date = new Date(wall);
  if (
    date.getUTCFullYear() !== parts[0] ||
    date.getUTCMonth() + 1 !== parts[1] ||
    date.getUTCDate() !== parts[2] ||
    parts[3]! > 23 ||
    parts[4]! > 59 ||
    parts[5]! > 59
  )
    throw new Error('Invalid calendar date/time.');
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: conventions.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const local = (instant: number) => {
    const record = Object.fromEntries(
      formatter.formatToParts(instant).map((part) => [part.type, part.value]),
    );
    return ['year', 'month', 'day', 'hour', 'minute', 'second'].map((key) => Number(record[key]));
  };
  const offsets = new Set(
    [-48, -24, -12, -6, 0, 6, 12, 24, 48].map((hours) => {
      const instant = wall + hours * 3_600_000;
      return utcMillis(local(instant)) - instant;
    }),
  );
  const candidates = [...offsets]
    .map((offset) => wall - offset)
    .filter((instant) => local(instant).every((value, index) => value === parts[index]));
  if (candidates.length !== 1)
    throw new Error(
      candidates.length
        ? 'Ambiguous DST time; supply an ISO timestamp with offset.'
        : 'Nonexistent local time; verify the date/timezone.',
    );
  return new Date(candidates[0]!)
    .toISOString()
    .replace(/\.\d{3}Z$/u, `.${(match[7] ?? '').padEnd(6, '0')}Z`);
}
