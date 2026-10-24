/** Risk is a versioned planning/monitoring opinion, never a financial posting or an R rewrite. */
export type RiskLimit =
  | {
      id: string;
      kind: 'trade-risk';
      maximum: string;
      currencyId: string;
      measure: 'amount' | 'equity-ratio';
    }
  | {
      id: string;
      kind: 'daily-loss' | 'weekly-loss';
      maximum: string;
      currencyId: string;
      basis: 'realized-activity' | 'account-change';
      includeIncome: boolean;
      timezone: string;
    }
  | { id: string; kind: 'positions'; maximum: number }
  | {
      id: string;
      kind: 'concentration';
      maximum: string;
      currencyId: string;
      instrumentId: string | null;
    }
  | {
      id: string;
      kind: 'exposure';
      maximum: string;
      currencyId: string;
      measure: 'gross' | 'net';
      denominator: 'amount' | 'equity';
    }
  | { id: string; kind: 'overnight'; timezone: string; boundaryHour: number }
  | {
      id: string;
      kind: 'prohibited';
      instrumentIds: string[];
      families: string[];
      subtypes: string[];
    };
export type RiskDefinition = {
  name: string;
  limits: RiskLimit[];
  maxAgeMilliseconds: number;
  priceSources: string[];
  fxSources: string[];
};
export type RiskFact = {
  value: string | null;
  unit: 'money' | 'ratio' | 'count' | 'boolean';
  currencyId: string | null;
  reasons: string[];
  references: string[];
};
export type RiskLimitAssessment = {
  policyVersionId: string;
  limit: RiskLimit;
  fact: RiskFact;
  state: 'passed' | 'breached' | 'unknown';
  explanation: string;
};
export type RiskSizingInput = {
  nativeLinear: boolean;
  side: 'long' | 'short';
  entry: string;
  stop: string;
  multiplier: string;
  quantityIncrement: string;
  quoteToRiskRate: string;
  budget: string;
  fixedCosts: string;
  perUnitCosts: string;
  currencyId: string;
};
export type RiskSizingResult = {
  state: 'available' | 'unknown';
  quantity: string | null;
  plannedRisk: string | null;
  riskPerUnit: string | null;
  budget: string;
  currencyId: string;
  reasons: string[];
};
