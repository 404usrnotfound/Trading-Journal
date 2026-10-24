import { describe, expect, it } from 'vitest';
import { formatJournalTimestamp } from '../../apps/web/src/components/journal/journal-time.js';

describe('workspace instant presentation shared by strategy history', () => {
  it('keeps the workspace calendar date when the browser is on the previous day', () => {
    const instant = '2026-10-22T00:30:00Z';
    const browser = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/New_York',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(instant));
    expect(browser).toBe('21/10/2026');
    const workspace = formatJournalTimestamp(instant, 'Europe/Madrid', 'en-GB');
    expect(workspace).toContain('22 Oct 2026');
    expect(workspace).toContain('02:30:00');
    expect(workspace).toContain('GMT+02:00');
  });
  it('uses the correct offset on each side of the daylight-saving transition', () => {
    const before = formatJournalTimestamp('2026-03-29T00:30:00Z', 'Europe/Madrid', 'en-GB');
    const after = formatJournalTimestamp('2026-03-29T01:30:00Z', 'Europe/Madrid', 'en-GB');
    expect(before).toContain('01:30:00');
    expect(before).toContain('GMT+01:00');
    expect(after).toContain('03:30:00');
    expect(after).toContain('GMT+02:00');
  });
});
