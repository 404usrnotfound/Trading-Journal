import { decimal, decimalValue, FinancialArithmeticError, quantizeDecimal } from './decimal.js';
import { instantNanoseconds } from './valuation.js';
import {
  ANALYTICS_DEFINITION_VERSION,
  ANALYTICS_DIMENSIONS,
  type AnalyticsCampaign,
  type AnalyticsCurve,
  type AnalyticsGroup,
  type AnalyticsInput,
  type AnalyticsMetric,
  type AnalyticsMetricName,
  type AnalyticsRecovery,
  type AnalyticsResult,
  type AnalyticsSourceMetric,
  type AnalyticsSummary,
} from './analytics-types.js';

export const ANALYTICS_MAX_CAMPAIGNS = 1_000;
export const ANALYTICS_MAX_GROUPS = 500;
type SourceField = 'grossPnl' | 'netPnl' | 'realizedPnl' | 'unrealizedPnl' | 'fees' | 'rMultiple';
type Sample = { campaign: AnalyticsCampaign; value: string };
type Population = {
  eligible: Sample[];
  excluded: AnalyticsCampaign[];
  reasons: string[];
  missing: string[];
};
const sorted = (values: readonly string[]) => [...new Set(values)].sort();

function sourceValue(source: AnalyticsSourceMetric): string | null {
  if (source.state !== 'available' || source.value === null) return null;
  try {
    return decimal(source.value);
  } catch (error) {
    if (error instanceof FinancialArithmeticError) return null;
    throw error;
  }
}

function population(
  campaigns: readonly AnalyticsCampaign[],
  field: SourceField,
  completed: boolean,
): Population {
  const result: Population = { eligible: [], excluded: [], reasons: [], missing: [] };
  for (const campaign of campaigns) {
    const value = sourceValue(campaign[field]);
    if (
      campaign.status !== 'excluded' &&
      (!completed || campaign.status === 'completed') &&
      value !== null
    )
      result.eligible.push({ campaign, value });
    else {
      result.excluded.push(campaign);
      if (campaign.status === 'excluded') {
        result.reasons.push(
          ...campaign.exclusionReasons,
          ...campaign[field].reasons,
          'excluded_campaign',
        );
        result.missing.push(...campaign[field].missingReferences);
      } else if (completed && campaign.status !== 'completed')
        result.reasons.push('campaign_not_completed');
      else {
        result.reasons.push(...campaign[field].reasons);
        if (campaign[field].state === 'available') result.reasons.push('invalid_source_metric');
        else if (!campaign[field].reasons.length) result.reasons.push('missing_source_metric');
        result.missing.push(...campaign[field].missingReferences);
      }
    }
  }
  return result;
}

function metric(
  name: AnalyticsMetricName,
  unit: AnalyticsMetric['unit'],
  currencyId: string | null,
  sample: Population,
  value: string | null,
  state: AnalyticsMetric['state'] = value === null ? 'unavailable' : 'available',
  reasons: readonly string[] = [],
  knownSubtotal: string | null = value,
): AnalyticsMetric {
  return {
    state,
    value,
    knownSubtotal,
    unit,
    currencyId,
    definitionId: `campaign-analytics/${name}/1`,
    sampleSize: sample.eligible.length,
    eligibleIds: sorted(sample.eligible.map(({ campaign }) => campaign.id)),
    excludedIds: sorted(sample.excluded.map((campaign) => campaign.id)),
    reasons: sorted([...sample.reasons, ...reasons]),
    missingReferences: sorted(sample.missing),
  };
}

function calculate(
  name: AnalyticsMetricName,
  unit: AnalyticsMetric['unit'],
  currency: string | null,
  sample: Population,
  operation: () => string,
): AnalyticsMetric {
  try {
    return metric(name, unit, currency, sample, operation());
  } catch (error) {
    if (error instanceof FinancialArithmeticError)
      return metric(name, unit, currency, sample, null, 'unavailable', [error.code]);
    throw error;
  }
}

function sum(sample: readonly Sample[]) {
  return sample.reduce((total, item) => total.plus(decimalValue(item.value)), decimalValue('0'));
}

function aggregate(
  name: AnalyticsMetricName,
  unit: 'money' | 'R',
  currency: string | null,
  sample: Population,
  emptyAvailable: boolean,
): AnalyticsMetric {
  // R is an eligible-sample statistic. An empty sample does not provide evidence of zero R.
  if (unit === 'R' && !sample.eligible.length)
    return metric(name, unit, currency, sample, null, 'unavailable', ['empty_eligible_population']);
  const result = calculate(name, unit, currency, sample, () =>
    quantizeDecimal(sum(sample.eligible)),
  );
  if (result.value === null) return result;
  if (sample.excluded.some((campaign) => campaign.status !== 'open' || unit === 'money'))
    return {
      ...result,
      state: sample.eligible.length ? 'partial' : 'unavailable',
      value: null,
      knownSubtotal: result.value,
    };
  if (!sample.eligible.length && !emptyAvailable)
    return {
      ...result,
      state: 'unavailable',
      value: null,
      knownSubtotal: null,
      reasons: sorted([...result.reasons, 'empty_eligible_population']),
    };
  return result;
}

function mean(
  name: AnalyticsMetricName,
  unit: AnalyticsMetric['unit'],
  currency: string | null,
  sample: Population,
): AnalyticsMetric {
  if (!sample.eligible.length)
    return metric(name, unit, currency, sample, null, 'unavailable', ['empty_eligible_population']);
  return calculate(name, unit, currency, sample, () =>
    quantizeDecimal(sum(sample.eligible).div(String(sample.eligible.length))),
  );
}

function subset(sample: Population, predicate: (sample: Sample) => boolean): Population {
  return {
    ...sample,
    eligible: sample.eligible.filter(predicate),
    excluded: [
      ...sample.excluded,
      ...sample.eligible
        .filter((candidate) => !predicate(candidate))
        .map(({ campaign }) => campaign),
    ],
  };
}

function durationPopulation(campaigns: readonly AnalyticsCampaign[], asOf: bigint): Population {
  const sample: Population = { eligible: [], excluded: [], reasons: [], missing: [] };
  for (const campaign of campaigns) {
    if (campaign.status !== 'completed') {
      sample.excluded.push(campaign);
      sample.reasons.push(
        campaign.status === 'open' ? 'campaign_not_completed' : 'excluded_campaign',
        ...campaign.exclusionReasons,
      );
      continue;
    }
    try {
      if (campaign.entryAt === null || campaign.closedAt === null)
        throw new FinancialArithmeticError('invalid_decimal', 'Missing lifecycle boundary.');
      const entry = instantNanoseconds(campaign.entryAt);
      const close = instantNanoseconds(campaign.closedAt);
      if (entry > close || close > asOf)
        throw new FinancialArithmeticError('invalid_decimal', 'Invalid lifecycle chronology.');
      const nanoseconds = close - entry;
      sample.eligible.push({
        campaign,
        value: quantizeDecimal(decimalValue(nanoseconds.toString()).div('1000000000')),
      });
    } catch (error) {
      if (!(error instanceof FinancialArithmeticError)) throw error;
      sample.excluded.push(campaign);
      sample.reasons.push('missing_or_invalid_lifecycle_chronology');
    }
  }
  return sample;
}

function emptyRecovery(
  state: AnalyticsRecovery['state'],
  reasons: readonly string[] = [],
): AnalyticsRecovery {
  return {
    state,
    peakAt: null,
    troughAt: null,
    recoveredAt: null,
    peakCampaignId: null,
    troughCampaignId: null,
    recoveredCampaignId: null,
    durationSeconds: null,
    elapsedSeconds: null,
    tradesToRecovery: null,
    reasons: sorted(reasons),
  };
}

function chronological(campaigns: readonly AnalyticsCampaign[], input: AnalyticsInput) {
  const sample = population(campaigns, 'netPnl', true);
  // Exclusion is not proof that a campaign is still open. Its unknown completion can hide a gap.
  const closed = campaigns.filter((campaign) => campaign.status !== 'open');
  const times = new Map<string, bigint>();
  const chronologyReasons: string[] = [];
  let ambiguousAdjacency = false;
  const excluded: string[] = [];
  const start = instantNanoseconds(input.from);
  const end = instantNanoseconds(input.asOf);
  for (const campaign of closed) {
    try {
      if (campaign.closedAt === null)
        throw new FinancialArithmeticError('invalid_decimal', 'Missing close.');
      const close = instantNanoseconds(campaign.closedAt);
      if (close <= start || close > end)
        throw new FinancialArithmeticError('invalid_decimal', 'Close outside population interval.');
      times.set(campaign.id, close);
    } catch (error) {
      if (!(error instanceof FinancialArithmeticError)) throw error;
      ambiguousAdjacency = true;
      chronologyReasons.push('missing_or_invalid_close_chronology');
      excluded.push(campaign.id);
    }
    if (campaign.status === 'excluded' || sourceValue(campaign.netPnl) === null) {
      chronologyReasons.push(
        'incomplete_completed_outcome',
        ...campaign.exclusionReasons,
        ...campaign.netPnl.reasons,
      );
      excluded.push(campaign.id);
    }
  }
  closed.sort((a, b) => {
    const left = times.get(a.id);
    const right = times.get(b.id);
    if (left === undefined && right !== undefined) return 1;
    if (left !== undefined && right === undefined) return -1;
    if (left === undefined || right === undefined) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return left < right ? -1 : left > right ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const lengths = {
    longestWinStreak: 0,
    longestLossStreak: 0,
    currentWinStreak: 0,
    currentLossStreak: 0,
  };
  for (const campaign of closed) {
    const value =
      campaign.status === 'excluded' || !times.has(campaign.id)
        ? null
        : sourceValue(campaign.netPnl);
    if (value === null || decimalValue(value).isZero()) {
      lengths.currentWinStreak = 0;
      lengths.currentLossStreak = 0;
    } else if (decimalValue(value).gt('0')) {
      lengths.currentWinStreak += 1;
      lengths.currentLossStreak = 0;
      lengths.longestWinStreak = Math.max(lengths.longestWinStreak, lengths.currentWinStreak);
    } else {
      lengths.currentLossStreak += 1;
      lengths.currentWinStreak = 0;
      lengths.longestLossStreak = Math.max(lengths.longestLossStreak, lengths.currentLossStreak);
    }
  }
  const chronologicalSample: Population = {
    ...sample,
    eligible: sample.eligible.filter(({ campaign }) => times.has(campaign.id)),
    excluded: [
      ...sample.excluded,
      ...sample.eligible
        .filter(({ campaign }) => !times.has(campaign.id))
        .map(({ campaign }) => campaign),
    ],
  };
  const streaks = Object.fromEntries(
    Object.entries(lengths).map(([name, length]) => [
      name,
      metric(
        name as AnalyticsMetricName,
        'count',
        null,
        chronologicalSample,
        chronologyReasons.length || !closed.length ? null : String(length),
        chronologyReasons.length || !closed.length ? 'unavailable' : 'available',
        closed.length ? chronologyReasons : ['empty_completed_population'],
        ambiguousAdjacency
          ? null
          : chronologyReasons.length
            ? String(length)
            : closed.length
              ? String(length)
              : null,
      ),
    ]),
  ) as Record<keyof typeof lengths, AnalyticsMetric>;
  const unavailableCurve = (reasons: readonly string[]) => ({
    curve: {
      state: 'unavailable',
      currencyId: input.reportingCurrencyId,
      definitionId: 'campaign-cumulative-net-pnl/1',
      points: [],
      reasons: sorted(reasons),
      excludedIds: sorted(excluded),
    } as AnalyticsCurve,
    recovery: emptyRecovery('unavailable', reasons),
    maximumDrawdown: metric(
      'maximumDrawdown',
      'money',
      input.reportingCurrencyId,
      chronologicalSample,
      null,
      'unavailable',
      reasons,
    ),
    currentDrawdown: metric(
      'currentDrawdown',
      'money',
      input.reportingCurrencyId,
      chronologicalSample,
      null,
      'unavailable',
      reasons,
    ),
    streaks,
  });
  if (!closed.length) return unavailableCurve(['empty_completed_population']);
  if (chronologyReasons.length) return unavailableCurve(chronologyReasons);
  try {
    const points: AnalyticsCurve['points'] = [
      { campaignId: null, economicAt: input.from, cumulativePnl: '0', peak: '0', drawdown: '0' },
    ];
    let cumulative = decimalValue('0');
    let peak = decimalValue('0');
    let peakIndex = 0;
    let maximum = decimalValue('0');
    type Episode = { peakIndex: number; troughIndex: number; recoveryIndex: number | null };
    let active: Episode | null = null;
    let maximumEpisode: Episode | null = null;
    for (const campaign of closed) {
      cumulative = cumulative.plus(decimalValue(campaign.netPnl.value));
      if (cumulative.gte(peak)) {
        if (active) active.recoveryIndex = points.length;
        active = null;
        peak = cumulative;
        peakIndex = points.length;
      } else if (!active) active = { peakIndex, troughIndex: points.length, recoveryIndex: null };
      const drawdown = peak.minus(cumulative);
      if (drawdown.gt(maximum)) {
        maximum = drawdown;
        if (active) active.troughIndex = points.length;
        maximumEpisode = active;
      }
      points.push({
        campaignId: campaign.id,
        economicAt: campaign.closedAt!,
        cumulativePnl: quantizeDecimal(cumulative),
        peak: quantizeDecimal(peak),
        drawdown: quantizeDecimal(drawdown),
      });
    }
    let recovery = emptyRecovery('no-drawdown');
    if (maximumEpisode) {
      const peakPoint = points[maximumEpisode.peakIndex]!;
      const troughPoint = points[maximumEpisode.troughIndex]!;
      const recoveredPoint =
        maximumEpisode.recoveryIndex === null ? null : points[maximumEpisode.recoveryIndex]!;
      const duration = (to: string) =>
        quantizeDecimal(
          decimalValue(
            (instantNanoseconds(to) - instantNanoseconds(peakPoint.economicAt)).toString(),
          ).div('1000000000'),
        );
      recovery = {
        ...emptyRecovery(recoveredPoint ? 'recovered' : 'unrecovered'),
        peakAt: peakPoint.economicAt,
        troughAt: troughPoint.economicAt,
        recoveredAt: recoveredPoint?.economicAt ?? null,
        peakCampaignId: peakPoint.campaignId,
        troughCampaignId: troughPoint.campaignId,
        recoveredCampaignId: recoveredPoint?.campaignId ?? null,
        durationSeconds: recoveredPoint ? duration(recoveredPoint.economicAt) : null,
        elapsedSeconds: recoveredPoint ? null : duration(input.asOf),
        tradesToRecovery:
          maximumEpisode.recoveryIndex === null
            ? null
            : maximumEpisode.recoveryIndex - maximumEpisode.peakIndex,
      };
    }
    return {
      curve: {
        state: 'available',
        currencyId: input.reportingCurrencyId,
        definitionId: 'campaign-cumulative-net-pnl/1',
        points,
        reasons: [],
        excludedIds: [],
      } as AnalyticsCurve,
      recovery,
      maximumDrawdown: metric(
        'maximumDrawdown',
        'money',
        input.reportingCurrencyId,
        chronologicalSample,
        quantizeDecimal(maximum),
      ),
      currentDrawdown: metric(
        'currentDrawdown',
        'money',
        input.reportingCurrencyId,
        chronologicalSample,
        points.at(-1)!.drawdown,
      ),
      streaks,
    };
  } catch (error) {
    if (error instanceof FinancialArithmeticError) return unavailableCurve([error.code]);
    throw error;
  }
}

function summary(campaigns: readonly AnalyticsCampaign[], input: AnalyticsInput): AnalyticsSummary {
  const outcomes = population(campaigns, 'netPnl', true);
  const winners = subset(outcomes, ({ value }) => decimalValue(value).gt('0'));
  const losers = subset(outcomes, ({ value }) => decimalValue(value).lt('0'));
  const lossMagnitudes = {
    ...losers,
    eligible: losers.eligible.map((candidate) => ({
      ...candidate,
      value: decimalValue(candidate.value).abs().toFixed(),
    })),
  };
  const r = population(campaigns, 'rMultiple', true);
  const duration = durationPopulation(campaigns, instantNanoseconds(input.asOf));
  const chrono = chronological(campaigns, input);
  const rate = (name: 'winRate' | 'lossRate', numerator: number) =>
    outcomes.eligible.length
      ? calculate(name, 'ratio', null, outcomes, () =>
          quantizeDecimal(decimalValue(String(numerator)).div(String(outcomes.eligible.length))),
        )
      : metric(name, 'ratio', null, outcomes, null, 'unavailable', ['empty_eligible_population']);
  const payoff = calculate('payoffRatio', 'ratio', null, outcomes, () => {
    if (!winners.eligible.length || !losers.eligible.length)
      throw new FinancialArithmeticError(
        'division_by_zero',
        'Payoff needs both component populations.',
      );
    return quantizeDecimal(
      sum(winners.eligible)
        .div(String(winners.eligible.length))
        .div(sum(lossMagnitudes.eligible).div(String(losers.eligible.length))),
    );
  });
  if (!winners.eligible.length || !losers.eligible.length)
    payoff.reasons = sorted([
      ...payoff.reasons.filter((reason) => reason !== 'division_by_zero'),
      'missing_winner_or_loser_population',
    ]);
  let profitFactor: AnalyticsMetric;
  if (!losers.eligible.length)
    profitFactor = metric(
      'profitFactor',
      'ratio',
      null,
      outcomes,
      null,
      winners.eligible.length ? 'infinite' : 'unavailable',
      [winners.eligible.length ? 'zero_loss_denominator' : 'no_gains_or_losses'],
    );
  else
    profitFactor = calculate('profitFactor', 'ratio', null, outcomes, () =>
      quantizeDecimal(sum(winners.eligible).div(sum(lossMagnitudes.eligible))),
    );
  const metrics: AnalyticsSummary['metrics'] = {
    grossPnl: aggregate(
      'grossPnl',
      'money',
      input.reportingCurrencyId,
      population(campaigns, 'grossPnl', false),
      true,
    ),
    netPnl: aggregate(
      'netPnl',
      'money',
      input.reportingCurrencyId,
      population(campaigns, 'netPnl', false),
      true,
    ),
    realizedPnl: aggregate(
      'realizedPnl',
      'money',
      input.reportingCurrencyId,
      population(campaigns, 'realizedPnl', false),
      true,
    ),
    unrealizedPnl: aggregate(
      'unrealizedPnl',
      'money',
      input.reportingCurrencyId,
      population(campaigns, 'unrealizedPnl', false),
      true,
    ),
    fees: aggregate(
      'fees',
      'money',
      input.reportingCurrencyId,
      population(campaigns, 'fees', false),
      true,
    ),
    winRate: rate('winRate', winners.eligible.length),
    lossRate: rate('lossRate', losers.eligible.length),
    averageWinner: mean('averageWinner', 'money', input.reportingCurrencyId, winners),
    averageLoser: mean('averageLoser', 'money', input.reportingCurrencyId, lossMagnitudes),
    payoffRatio: payoff,
    profitFactor,
    expectancy: mean('expectancy', 'money', input.reportingCurrencyId, outcomes),
    expectancyR: mean('expectancyR', 'R', null, r),
    averageR: mean('averageR', 'R', null, r),
    cumulativeR: aggregate('cumulativeR', 'R', null, r, false),
    averageHoldingDuration: mean('averageHoldingDuration', 'seconds', null, duration),
    maximumDrawdown: chrono.maximumDrawdown,
    currentDrawdown: chrono.currentDrawdown,
    ...chrono.streaks,
  };
  // R is an explicitly eligible-sample statistic, not a missing-data claim about all campaigns.
  if (
    r.eligible.length &&
    metrics.cumulativeR.knownSubtotal !== null &&
    metrics.cumulativeR.state === 'partial'
  )
    metrics.cumulativeR = {
      ...metrics.cumulativeR,
      state: 'available',
      value: metrics.cumulativeR.knownSubtotal,
    };
  return {
    population: {
      campaignIds: sorted(campaigns.map((campaign) => campaign.id)),
      completedIds: sorted(
        campaigns
          .filter((campaign) => campaign.status === 'completed')
          .map((campaign) => campaign.id),
      ),
      openIds: sorted(
        campaigns.filter((campaign) => campaign.status === 'open').map((campaign) => campaign.id),
      ),
      excludedIds: sorted(
        campaigns
          .filter((campaign) => campaign.status === 'excluded')
          .map((campaign) => campaign.id),
      ),
      eligibleOutcomeIds: metrics.winRate.eligibleIds,
      eligibleRIds: metrics.averageR.eligibleIds,
      eligibleDurationIds: metrics.averageHoldingDuration.eligibleIds,
    },
    metrics,
    counts: {
      selected: campaigns.length,
      completed: campaigns.filter((campaign) => campaign.status === 'completed').length,
      open: campaigns.filter((campaign) => campaign.status === 'open').length,
      excluded: campaigns.filter((campaign) => campaign.status === 'excluded').length,
      eligibleOutcomes: outcomes.eligible.length,
      wins: winners.eligible.length,
      losses: losers.eligible.length,
      breakevens: outcomes.eligible.length - winners.eligible.length - losers.eligible.length,
      eligibleR: r.eligible.length,
      eligibleDuration: duration.eligible.length,
    },
    curve: chrono.curve,
    recovery: chrono.recovery,
  };
}

/** No I/O, clocks, mutable decimal defaults or money represented by binary floating point. */
export function calculateAnalytics(input: AnalyticsInput): AnalyticsResult {
  if (
    !input.reportingCurrencyId ||
    input.campaigns.length > ANALYTICS_MAX_CAMPAIGNS ||
    new Set(input.campaigns.map((campaign) => campaign.id)).size !== input.campaigns.length
  )
    throw new FinancialArithmeticError(
      'invalid_allocation',
      'Analytics needs a bounded, unique campaign population.',
    );
  if (instantNanoseconds(input.from) >= instantNanoseconds(input.asOf))
    throw new FinancialArithmeticError('invalid_decimal', 'Analytics interval must increase.');
  const dimensions = input.groupBy ?? [];
  if (
    new Set(dimensions).size !== dimensions.length ||
    dimensions.some((dimension) => !ANALYTICS_DIMENSIONS.includes(dimension))
  )
    throw new FinancialArithmeticError(
      'invalid_allocation',
      'Analytics dimensions must be unique and supported.',
    );
  type GroupInput = Omit<AnalyticsGroup, 'summary'> & { campaigns: AnalyticsCampaign[] };
  const groups = new Map<string, GroupInput>();
  for (const dimension of dimensions) {
    for (const campaign of input.campaigns) {
      const rawValues = campaign.dimensions[dimension] ?? [];
      if (
        rawValues.length > 100 ||
        rawValues.some(
          (value) => !value.key || value.key.length > 20_000 || value.label.length > 20_000,
        )
      )
        throw new FinancialArithmeticError(
          'invalid_allocation',
          'Analytics dimension values must be bounded.',
        );
      // Identity determines membership; historical labels cannot make an input reorder change it.
      const values = [...rawValues]
        .sort((a, b) =>
          a.key < b.key
            ? -1
            : a.key > b.key
              ? 1
              : a.label < b.label
                ? -1
                : a.label > b.label
                  ? 1
                  : 0,
        )
        .filter(
          (value, index, candidates) => index === 0 || candidates[index - 1]!.key !== value.key,
        );
      const memberships =
        dimension === 'tag' && values.length ? values.map((value) => [value]) : [values];
      for (const membership of memberships) {
        const kind =
          membership.length === 0 ? 'unknown' : membership.length === 1 ? 'value' : 'mixed';
        const key = kind === 'value' ? `value:${membership[0]!.key}` : kind;
        const mapKey = `${dimension}:${key}`;
        let group = groups.get(mapKey);
        if (!group) {
          if (groups.size === ANALYTICS_MAX_GROUPS)
            throw new FinancialArithmeticError(
              'invalid_allocation',
              'Analytics grouping exceeds the 500-group limit.',
            );
          group = {
            dimension,
            key,
            label: kind === 'value' ? membership[0]!.label : kind === 'mixed' ? 'Mixed' : 'Unknown',
            kind,
            memberKeys: [],
            additive: dimension !== 'tag',
            campaigns: [],
          };
          groups.set(mapKey, group);
        }
        if (kind === 'value' && membership[0]!.label < group.label)
          group.label = membership[0]!.label;
        group.memberKeys.push(...membership.map((value) => value.key));
        group.campaigns.push(campaign);
      }
    }
  }
  return {
    summary: summary(input.campaigns, input),
    completedOnly: summary(
      // Keep excluded source evidence: an uncertain cohort must not become a complete empty sum.
      input.campaigns.filter((campaign) => campaign.status !== 'open'),
      input,
    ),
    openOnly: summary(
      input.campaigns.filter((campaign) => campaign.status === 'open'),
      input,
    ),
    groups: [...groups.values()]
      .sort(
        (a, b) =>
          dimensions.indexOf(a.dimension) - dimensions.indexOf(b.dimension) ||
          (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
      )
      .map(({ campaigns, ...group }) => ({
        ...group,
        memberKeys: sorted(group.memberKeys),
        summary: summary(campaigns, input),
      })),
    definitionVersion: ANALYTICS_DEFINITION_VERSION,
  };
}
