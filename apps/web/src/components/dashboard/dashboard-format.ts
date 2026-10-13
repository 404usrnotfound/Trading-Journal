/** Presentation only; authoritative financial values stay decimal strings. */
export function formatDashboardValue(value: string | null, unit: string): string {
  if (value === null) return 'Unavailable';
  const number = Number(value);
  // Preserve the sign and significance of fractional currency amounts instead of showing zero.
  const precision =
    number !== 0 && Math.abs(number) < 0.01
      ? { maximumSignificantDigits: 3 }
      : { maximumFractionDigits: 2 };
  return `${new Intl.NumberFormat(undefined, precision).format(number)}${unit === 'ratio' ? '' : ` ${unit}`}`;
}
