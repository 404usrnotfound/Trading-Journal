/** Display an instant in the configured workspace zone, including its DST offset. */
export function formatJournalTimestamp(instant: string, timeZone: string, locale?: string): string {
  const formatted = new Intl.DateTimeFormat(locale, {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  }).format(new Date(instant));
  return `${formatted} · ${timeZone}`;
}
