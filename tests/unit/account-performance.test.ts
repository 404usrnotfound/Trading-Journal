import { describe, expect, it } from 'vitest';
import {
  calculateAccountPerformance,
  decimalValue,
  type AccountPerformancePoint,
} from '@journal/domain';

const point = (
  at: string,
  nav: string | null,
  capitalFlow = '0',
  reasons: string[] = [],
): AccountPerformancePoint => ({ at, nav, capitalFlow, reasons });
const date = (year: number) => `${year}-01-01T00:00:00.000001Z`;

describe('account return sufficiency and exact flow boundaries', () => {
  it('returns unambiguous ten-percent annual TWR and MWR from complete no-flow valuations', () => {
    const value = calculateAccountPerformance([point(date(2025), '100'), point(date(2026), '110')]);
    expect(value.twr).toEqual({ state: 'available', value: '0.1', reasons: [] });
    expect(value.mwr).toEqual({ state: 'available', value: '0.1', reasons: [] });
    expect(value.series.map((row) => row.unitIndex)).toEqual(['100', '110']);
    expect(value.maximumDrawdown.value).toBe('0');
  });
  it('removes contributions from the unit index and uses investor-sign cash flows for MWR', () => {
    const value = calculateAccountPerformance([
      point(date(2025), '100'),
      point(date(2026), '200', '100'),
      point(date(2027), '220'),
    ]);
    expect(value.twr.value).toBe('0.1');
    expect(value.series.map((row) => row.unitIndex)).toEqual(['100', '100', '110']);
    const growth = decimalValue(value.mwr.value).plus(1);
    expect(
      growth
        .times(growth)
        .times(100)
        .plus(growth.times(100))
        .minus(220)
        .abs()
        .lt('0.000000000000000000000000000001'),
    ).toBe(true);
  });
  it('does not show deposit-driven drawdown recovery', () => {
    const value = calculateAccountPerformance([
      point(date(2025), '100'),
      point(date(2026), '80'),
      point(date(2027), '180', '100'),
    ]);
    expect(value.series.map((row) => row.unitIndex)).toEqual(['100', '80', '80']);
    expect(value.maximumDrawdown.value).toBe('-0.2');
    expect(value.recoveryDurationMilliseconds).toBeNull();
  });
  it('measures observed recovery from the unitized peak rather than the contribution total', () => {
    const value = calculateAccountPerformance([
      point(date(2025), '100'),
      point(date(2026), '80'),
      point(date(2027), '100'),
    ]);
    expect(value.recoveryDurationMilliseconds).toBe(String(2 * 365 * 86_400_000));
  });
  it('breaks flow-adjusted results for missing valuation or flow evidence without hiding raw NAV', () => {
    const value = calculateAccountPerformance([
      point(date(2025), '100'),
      point(date(2026), null, '10', ['missing_price']),
      point(date(2027), '200'),
    ]);
    expect(value.twr.state).toBe('unavailable');
    expect(value.mwr.state).toBe('available');
    expect(value.series.at(-1)).toMatchObject({ nav: '200', unitIndex: null, drawdown: null });
  });
  it('declines nonpositive capital denominators and ambiguous MWR sign patterns', () => {
    expect(
      calculateAccountPerformance([point(date(2025), '0'), point(date(2026), '10', '10')]).twr
        .state,
    ).toBe('unavailable');
    const ambiguous = calculateAccountPerformance([
      point(date(2025), '100'),
      point(date(2026), '100', '-150'),
      point(date(2027), '200', '100'),
      point(date(2028), '10'),
    ]);
    expect(ambiguous.mwr).toEqual({
      state: 'unavailable',
      value: null,
      reasons: ['mwr_root_uniqueness_not_established'],
    });
  });
  it('keeps a valid period TWR when annualized MWR is outside the supported solver range', () => {
    const value = calculateAccountPerformance([
      point('2025-01-01T00:00:00.000001Z', '1'),
      point('2025-01-01T00:00:00.000002Z', '2'),
    ]);
    expect(value.twr.value).toBe('1');
    expect(value.mwr.state).toBe('unavailable');
    expect(value.mwr.reasons).toEqual(['mwr_solution_outside_supported_range']);
  });
  it('returns explicit numeric overflow when a derived unit index cannot fit the financial result envelope', () => {
    const value = calculateAccountPerformance([
      point(date(2025), '0.000000000000000000000000000000000001'),
      point(date(2026), '999999999999999999999999999999999999999999'),
    ]);
    expect(value.twr).toEqual({ state: 'unavailable', value: null, reasons: ['numeric_overflow'] });
  });
});
