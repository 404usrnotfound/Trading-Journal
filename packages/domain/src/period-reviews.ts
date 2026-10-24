/** A deterministic process summary; no financial result or causal interpretation is invented. */
export function summarizePeriodReview(input: {
  trades: readonly { id: string; status: string; reviewed: boolean; mistakes: readonly string[] }[];
  goalCount: number;
  openActionCount: number;
}) {
  const statuses: Record<string, number> = {},
    mistakes = new Map<string, number>();
  const seen = new Set<string>();
  for (const trade of input.trades) {
    if (seen.has(trade.id)) throw new Error('Summary trades must have unique identities.');
    seen.add(trade.id);
    statuses[trade.status] = (statuses[trade.status] ?? 0) + 1;
    for (const label of new Set(trade.mistakes))
      mistakes.set(label, (mistakes.get(label) ?? 0) + 1);
  }
  return {
    linkedTradeCount: input.trades.length,
    reviewedTradeCount: input.trades.filter((trade) => trade.reviewed).length,
    statusCounts: statuses,
    missingTradeReviewIds: input.trades.filter((trade) => !trade.reviewed).map((trade) => trade.id),
    recurringMistakes: [...mistakes]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'en')),
    goalCount: input.goalCount,
    openActionCount: input.openActionCount,
    explanation:
      'Counts summarize the explicitly linked trades and their current recorded reviews. A repeated mistake label is a reported observation, not a causal conclusion. Use the canonical analytics for financial outcomes and period populations.',
  };
}
