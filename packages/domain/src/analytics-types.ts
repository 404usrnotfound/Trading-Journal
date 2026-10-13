export const ANALYTICS_DIMENSIONS = [
  'strategy',
  'strategyVersion',
  'asset',
  'assetClass',
  'broker',
  'account',
  'currency',
  'direction',
  'weekday',
  'hour',
  'timeframe',
  'setup',
  'tag',
  'marketCondition',
] as const;

export const ANALYTICS_DEFINITION_VERSION = 'campaign-analytics/1' as const;
export type AnalyticsDimension = (typeof ANALYTICS_DIMENSIONS)[number];

/** Inputs have already acquired campaign attribution and one explicit reporting currency. */
export type AnalyticsSourceMetric = Readonly<{
  state: 'available' | 'unavailable';
  value: string | null;
  reasons: readonly string[];
  missingReferences: readonly string[];
}>;
export type AnalyticsDimensionValue = Readonly<{ key: string; label: string }>;
export type AnalyticsCampaign = Readonly<{
  id: string;
  status: 'completed' | 'open' | 'excluded';
  entryAt: string | null;
  closedAt: string | null;
  grossPnl: AnalyticsSourceMetric;
  netPnl: AnalyticsSourceMetric;
  realizedPnl: AnalyticsSourceMetric;
  unrealizedPnl: AnalyticsSourceMetric;
  fees: AnalyticsSourceMetric;
  /** Validated immutable original-risk result; the kernel never substitutes new risk. */
  rMultiple: AnalyticsSourceMetric;
  dimensions: Partial<Record<AnalyticsDimension, readonly AnalyticsDimensionValue[]>>;
  exclusionReasons: readonly string[];
  originalPlanId?: string | null;
}>;
export type AnalyticsMetric = {
  state: 'available' | 'partial' | 'unavailable' | 'infinite';
  value: string | null;
  knownSubtotal: string | null;
  unit: 'money' | 'ratio' | 'R' | 'seconds' | 'count';
  currencyId: string | null;
  definitionId: string;
  sampleSize: number;
  eligibleIds: string[];
  excludedIds: string[];
  reasons: string[];
  missingReferences: string[];
};
export type AnalyticsMetricName =
  | 'grossPnl'
  | 'netPnl'
  | 'realizedPnl'
  | 'unrealizedPnl'
  | 'fees'
  | 'winRate'
  | 'lossRate'
  | 'averageWinner'
  | 'averageLoser'
  | 'payoffRatio'
  | 'profitFactor'
  | 'expectancy'
  | 'expectancyR'
  | 'averageR'
  | 'cumulativeR'
  | 'averageHoldingDuration'
  | 'maximumDrawdown'
  | 'currentDrawdown'
  | 'longestWinStreak'
  | 'longestLossStreak'
  | 'currentWinStreak'
  | 'currentLossStreak';
export type AnalyticsCurve = {
  state: 'available' | 'unavailable';
  currencyId: string;
  definitionId: 'campaign-cumulative-net-pnl/1';
  points: {
    campaignId: string | null;
    economicAt: string;
    cumulativePnl: string;
    peak: string;
    drawdown: string;
  }[];
  reasons: string[];
  excludedIds: string[];
};
export type AnalyticsRecovery = {
  state: 'recovered' | 'unrecovered' | 'no-drawdown' | 'unavailable';
  peakAt: string | null;
  troughAt: string | null;
  recoveredAt: string | null;
  peakCampaignId: string | null;
  troughCampaignId: string | null;
  recoveredCampaignId: string | null;
  durationSeconds: string | null;
  elapsedSeconds: string | null;
  tradesToRecovery: number | null;
  reasons: string[];
};
export type AnalyticsSummary = {
  population: {
    campaignIds: string[];
    completedIds: string[];
    openIds: string[];
    excludedIds: string[];
    eligibleOutcomeIds: string[];
    eligibleRIds: string[];
    eligibleDurationIds: string[];
  };
  metrics: Record<AnalyticsMetricName, AnalyticsMetric>;
  counts: {
    selected: number;
    completed: number;
    open: number;
    excluded: number;
    eligibleOutcomes: number;
    wins: number;
    losses: number;
    breakevens: number;
    eligibleR: number;
    eligibleDuration: number;
  };
  curve: AnalyticsCurve;
  recovery: AnalyticsRecovery;
};
export type AnalyticsGroup = {
  dimension: AnalyticsDimension;
  key: string;
  label: string;
  kind: 'value' | 'mixed' | 'unknown';
  memberKeys: string[];
  additive: boolean;
  summary: AnalyticsSummary;
};
export type AnalyticsResult = {
  summary: AnalyticsSummary;
  completedOnly: AnalyticsSummary;
  openOnly: AnalyticsSummary;
  groups: AnalyticsGroup[];
  definitionVersion: typeof ANALYTICS_DEFINITION_VERSION;
};
export type AnalyticsInput = Readonly<{
  campaigns: readonly AnalyticsCampaign[];
  reportingCurrencyId: string;
  from: string;
  asOf: string;
  groupBy?: readonly AnalyticsDimension[];
}>;
