import { describe, expect, it } from 'vitest';
import type { BudgetLine, BudgetStatus, BudgetsReport } from '@shared/controls';
import { budgetAlerts, budgetHeadline, corporateBadge, extraNeedYou, gaugeLines } from './budgetModel';

const line = (over: Partial<BudgetLine>): BudgetLine => ({
  period: 'monthly', limit: 20, spent: 10, ratio: 0.5, level: 'ok', from: '2026-10-01T04:00:00.000Z', to: '2026-10-13T19:00:00.000Z', unpricedModels: [], ...over,
});
const status = (over: Partial<BudgetStatus>): BudgetStatus => ({ personId: 'dwight', name: 'Dwight Schrute', level: 'ok', lines: [line({})], action: 'none', ...over });
const report = (budgets: BudgetStatus[]): BudgetsReport => ({ generatedAt: '2026-10-13T19:00:00.000Z', currency: 'USD', estimate: true, autoPause: false, warnAt: 0.8, budgets });

describe('gaugeLines', () => {
  it('turns each budget line into a gauge: spend of limit, percent, a bar capped at 100%', () => {
    expect(gaugeLines(status({ lines: [line({ period: 'daily', limit: 2, spent: 0.5, ratio: 0.25 }), line({ spent: 21, ratio: 1.05, level: 'over' })] }))).toEqual([
      { period: 'daily', label: 'Today', level: 'ok', text: '$0.50 of $2.00', pctText: '25%', bar: 0.25 },
      { period: 'monthly', label: 'This month', level: 'over', text: '$21.00 of $20.00', pctText: '105%', bar: 1 },
    ]);
  });

  it('says it can\'t price a model instead of inventing a number', () => {
    expect(gaugeLines(status({ lines: [line({ spent: null, ratio: null, level: 'unpriced', unpricedModels: ['house-model'] })] }))[0])
      .toEqual({ period: 'monthly', label: 'This month', level: 'unpriced', text: '— of $20.00', pctText: '', bar: 0, note: 'can’t price house-model' });
    expect(gaugeLines(status({ lines: [line({ spent: 3, ratio: 0.15, level: 'unpriced', unpricedModels: ['a', 'b', 'c'] })] }))[0]?.note)
      .toBe('plus usage it can’t price: a, b +1');
    expect(gaugeLines(status({ lines: [line({ spent: null, ratio: null, level: 'no-data' })] }))[0]).toMatchObject({ text: '— of $20.00', note: 'no usage data' });
  });
});

describe('headlines, alerts and the top-bar badge', () => {
  it('names what Corporate did', () => {
    expect(budgetHeadline(status({ level: 'over', action: 'paused' }))).toBe('Corporate froze the expense account');
    expect(budgetHeadline(status({ level: 'over', action: 'alert' }))).toBe('Over budget: Corporate wants to talk to you');
    expect(budgetHeadline(status({ level: 'warn' }))).toBe('Near budget');
    expect(budgetHeadline(status({ level: 'ok' }))).toBeNull();
  });

  it('alerts (needs you) for over-budget bots Corporate did not pause', () => {
    const r = report([status({ personId: 'a', level: 'over', action: 'alert' }), status({ personId: 'b', level: 'over', action: 'paused' }), status({ personId: 'c', level: 'warn' })]);
    expect(budgetAlerts(r).map((b) => b.personId)).toEqual(['a']);
    expect(budgetAlerts(null)).toEqual([]);
  });

  it('badges the top bar with how many are over (red) or near (amber)', () => {
    expect(corporateBadge(report([status({ level: 'over', action: 'paused' }), status({ level: 'warn' }), status({ level: 'ok' })])))
      .toEqual({ over: 1, warn: 1, label: '1 over budget, 1 near' });
    expect(corporateBadge(report([status({ level: 'warn' })]))).toEqual({ over: 0, warn: 1, label: '1 near budget' });
    expect(corporateBadge(report([status({ level: 'ok' }), status({ level: 'unpriced' })]))).toBeNull();
    expect(corporateBadge(null)).toBeNull();
  });
});

describe('budget alerts in the "need you" count', () => {
  it('adds over-budget bots that do not already need you', () => {
    const alerts = [status({ personId: 'kelly', level: 'over', action: 'alert' }), status({ personId: 'andy', level: 'over', action: 'alert' })];
    expect(extraNeedYou(alerts, new Set(['andy']))).toBe(1);
    expect(extraNeedYou([], new Set())).toBe(0);
  });
});
