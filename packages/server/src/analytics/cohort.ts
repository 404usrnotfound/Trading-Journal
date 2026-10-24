import { decimalValue } from '@journal/domain';
import { financialInstantMicros } from '../financial/reference-data.js';

type Leg = { id: string; trade_id: string; direction: 'long' | 'short'; closure_id: string | null };
type Fill = {
  leg_id: string;
  side: 'buy' | 'sell';
  allocated_quantity: string;
  economic_at: string;
};

/** Only prove exclusion for validated closed/flat native histories. Unknown or
 * inconsistent histories continue through the ordinary kernel and explanations. */
export function analyticsCohort<LegRow extends Leg, FillRow extends Fill>(
  legs: readonly LegRow[],
  fills: readonly FillRow[],
  from: string,
  native: (leg: LegRow, fill: FillRow | undefined) => boolean,
): Set<string> {
  const cutoff = financialInstantMicros(from);
  const byLeg = new Map<string, FillRow[]>();
  for (const fill of fills) {
    const rows = byLeg.get(fill.leg_id) ?? [];
    rows.push(fill);
    byLeg.set(fill.leg_id, rows);
  }
  const excluded = new Map<string, boolean>();
  for (const leg of legs) {
    let flatHistoric = leg.closure_id !== null && native(leg, undefined);
    let quantity = decimalValue('0');
    for (const fill of byLeg.get(leg.id) ?? []) {
      if (!flatHistoric) break;
      try {
        if (financialInstantMicros(fill.economic_at) > cutoff || !native(leg, fill)) {
          flatHistoric = false;
          break;
        }
        quantity = quantity.plus(
          decimalValue(fill.allocated_quantity).times(
            (leg.direction === 'long') === (fill.side === 'buy') ? '1' : '-1',
          ),
        );
        if (quantity.isNegative()) flatHistoric = false;
      } catch {
        flatHistoric = false;
      }
    }
    excluded.set(
      leg.trade_id,
      (excluded.get(leg.trade_id) ?? true) && flatHistoric && quantity.isZero(),
    );
  }
  return new Set([...excluded].filter(([, oldFlat]) => !oldFlat).map(([id]) => id));
}
