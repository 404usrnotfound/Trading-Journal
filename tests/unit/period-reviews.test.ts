import { describe, expect, it } from 'vitest';
import {
  periodReviewDefinitionSchema,
  periodReviewTemplateDefinitionSchema,
  validatePeriodReviewAnswers,
} from '@journal/contracts';
import { summarizePeriodReview } from '@journal/domain';
const id = '11111111-1111-4111-8111-111111111111';
const definition = () =>
  periodReviewDefinitionSchema.parse({
    title: 'A real weekly review',
    kind: 'weekly',
    from: '2026-10-19T00:00:00Z',
    to: '2026-10-26T00:00:00Z',
    timezone: 'Europe/Madrid',
    status: 'draft',
    notes: '',
    goals: [],
    recurringMistakes: [],
    emotions: [],
    improvementActions: [],
    templateVersionId: null,
    answers: [],
    tradeIds: [],
    strategyVersionIds: [],
  });
describe('standalone review contracts and deterministic summaries', () => {
  it('supports every required period type without a fictitious trade or template', () => {
    for (const kind of [
      'daily',
      'session-preparation',
      'session-review',
      'weekly',
      'monthly',
      'custom',
    ])
      expect(periodReviewDefinitionSchema.safeParse({ ...definition(), kind }).success).toBe(true);
    expect(
      periodReviewDefinitionSchema.safeParse({
        ...definition(),
        from: '2026-01-01T00:00:00.000001Z',
        to: '2026-01-01T00:00:00.000002Z',
      }).success,
    ).toBe(true);
    expect(
      periodReviewDefinitionSchema.safeParse({ ...definition(), to: '2026-10-18T00:00:00Z' })
        .success,
    ).toBe(false);
    expect(
      periodReviewDefinitionSchema.safeParse({ ...definition(), timezone: 'invented/timezone' })
        .success,
    ).toBe(false);
    expect(
      periodReviewDefinitionSchema.safeParse({ ...definition(), tradeIds: [id, id] }).success,
    ).toBe(false);
  });
  it('requires complete typed answers only on finalization and treats a recorded false as present', () => {
    const template = periodReviewTemplateDefinitionSchema.parse({
      name: 'Process quality',
      status: 'active',
      instructions: 'Review recorded facts.',
      fields: [{ id, label: 'Followed preparation', type: 'boolean', required: true, help: '' }],
    });
    const draft = { ...definition(), templateVersionId: id };
    expect(() => validatePeriodReviewAnswers(draft, template)).not.toThrow();
    expect(() => validatePeriodReviewAnswers({ ...draft, status: 'final' }, template)).toThrow(
      'required',
    );
    expect(() =>
      validatePeriodReviewAnswers(
        { ...draft, status: 'final', answers: [{ fieldId: id, value: false }] },
        template,
      ),
    ).not.toThrow();
    expect(() =>
      validatePeriodReviewAnswers(
        { ...draft, answers: [{ fieldId: id, value: 'false' }] },
        template,
      ),
    ).toThrow('wrong type');
    const decimal = { ...template, fields: [{ ...template.fields[0]!, type: 'decimal' as const }] };
    expect(() =>
      validatePeriodReviewAnswers(
        { ...draft, answers: [{ fieldId: id, value: '0.123456789012345678901234567890123456' }] },
        decimal,
      ),
    ).not.toThrow();
    expect(() =>
      validatePeriodReviewAnswers({ ...draft, answers: [{ fieldId: id, value: '1e3' }] }, decimal),
    ).toThrow('exact decimal');
    expect(
      periodReviewTemplateDefinitionSchema.safeParse({ ...template, formula: 'eval(input)' })
        .success,
    ).toBe(false);
  });
  it('counts explicit links, known review coverage and repeated self-reported mistakes without causal claims', () => {
    const summary = summarizePeriodReview({
      trades: [
        { id: 'a', status: 'closed', reviewed: true, mistakes: ['Late entry', 'Late entry'] },
        { id: 'b', status: 'open', reviewed: false, mistakes: ['Late entry', 'Skipped check'] },
      ],
      goalCount: 2,
      openActionCount: 1,
    });
    expect(summary).toMatchObject({
      linkedTradeCount: 2,
      reviewedTradeCount: 1,
      missingTradeReviewIds: ['b'],
      statusCounts: { closed: 1, open: 1 },
      recurringMistakes: [
        { label: 'Late entry', count: 2 },
        { label: 'Skipped check', count: 1 },
      ],
      goalCount: 2,
      openActionCount: 1,
    });
    expect(summary.explanation).toContain('not a causal conclusion');
    expect(() =>
      summarizePeriodReview({
        trades: [
          { id: 'a', status: 'closed', reviewed: true, mistakes: [] },
          { id: 'a', status: 'closed', reviewed: true, mistakes: [] },
        ],
        goalCount: 0,
        openActionCount: 0,
      }),
    ).toThrow('unique');
  });
});
