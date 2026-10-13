/** Translate a local calendar boundary into UTC, retaining DST instead of assuming 24-hour days. */
export function localDayBoundary(day: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Choose a valid calendar date.');
  const [year, month, date] = day.split('-').map(Number);
  const desired = Date.UTC(year!, month! - 1, date!);
  if (new Date(desired).toISOString().slice(0, 10) !== day)
    throw new Error('Choose a valid calendar date.');
  let candidate = desired;
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 6; attempt++) {
    const parts = formatter.formatToParts(new Date(candidate));
    const get = (key: string) => Number(parts.find((part) => part.type === key)!.value);
    const represented = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second'),
    );
    const correction = desired - represented;
    if (correction === 0) return new Date(candidate).toISOString();
    candidate += correction;
  }
  throw new Error('This local midnight is ambiguous or unavailable. Choose another boundary.');
}
export function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
export function inclusiveDateRange(from: string, to: string, timezone: string) {
  localDayBoundary(to, timezone);
  const start = localDayBoundary(from, timezone),
    end = localDayBoundary(nextDay(to), timezone);
  // Engine interval is (from,to]; subtract one microsecond from both local boundaries.
  const before = (iso: string) =>
    new Date(Date.parse(iso) - 1).toISOString().replace(/\.(\d{3})Z$/, '.$1999Z');
  return { from: before(start), to: before(end) };
}
export function todayInZone(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  return ['year', 'month', 'day']
    .map((key) => parts.find((part) => part.type === key)!.value)
    .join('-');
}
