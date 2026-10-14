/** Translate schema paths into the field names visible in the journal. */
export function journalValidationMessage(path: readonly PropertyKey[], message: string): string {
  const names: Record<string, string> = {
    title: 'Trade title',
    classification: 'Classification',
    strategyVersionId: 'Strategy version',
    setupId: 'Setup',
    accountId: 'Account',
    instrumentVersionId: 'Instrument',
    plannedEntry: 'Planned entry',
    plannedStop: 'Planned stop',
    plannedTargets: 'Planned targets',
    plannedQuantity: 'Planned quantity',
    estimatedCosts: 'Estimated costs',
    actualStop: 'Actual stop',
    reportedEntry: 'Manually reported entry',
    reportedExit: 'Manually reported exit',
    customTags: 'Custom tags',
    emotions: 'Emotions',
    mistakes: 'Mistakes',
    thesis: 'Thesis',
    marketConditions: 'Market conditions',
    confidence: 'Confidence',
    executionQuality: 'Execution quality',
    lessonsLearned: 'Lessons learned',
    postTradeReview: 'Post-trade review',
    customNotes: 'Custom notes',
    exitReason: 'Exit reason',
  };
  const field = path.filter((part) => typeof part === 'string').at(-1);
  const initialRisk = path.includes('initialRisk');
  const riskNames: Record<string, string> = {
    amount: 'Initial risk amount',
    currencyId: 'Initial risk currency',
    method: 'Initial risk methodology',
    methodNotes: 'Risk methodology notes',
  };
  const label =
    typeof field === 'string' ? (initialRisk ? riskNames[field] : names[field]) : undefined;
  const legIndex = path.indexOf('legs');
  const ordinal =
    legIndex >= 0 && typeof path[legIndex + 1] === 'number'
      ? ` · Leg ${Number(path[legIndex + 1]) + 1}`
      : '';
  return `${label ?? 'Journal information'}${ordinal}: ${message}`;
}
