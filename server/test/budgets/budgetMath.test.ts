// Budget math: period windows in local time (a day from midnight, a month from the 1st), and a budget line's level
// from the priced spend. Unpriced usage is never counted as spend and never makes a line "over".
import { describe, expect, it } from 'vitest';
import type { UsageSummary } from '../../../shared/observability.ts';
import { budgetWindow } from '../../src/budgets/periods.ts';
import { budgetLine, worstLevel } from '../../src/budgets/evaluate.ts';

const local = (y: number, m: number, d: number, h = 0, min = 0, s = 0, ms = 0) => new Date(y, m - 1, d, h, min, s, ms).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

describe('budgetWindow', () => {
  it('a daily budget counts from local midnight, a monthly one from local midnight on the 1st', () => {
    const now = local(2026, 10, 13, 15, 30);
    expect(budgetWindow('daily', now)).toEqual({ from: iso(local(2026, 10, 13)), to: iso(now) });
    expect(budgetWindow('monthly', now)).toEqual({ from: iso(local(2026, 10, 1)), to: iso(now) });
  });

  it('resets exactly at the boundary: 23:59:59.999 is still yesterday, 00:00 is a new day and a new month', () => {
    const lastMs = local(2026, 10, 31, 23, 59, 59, 999);
    expect(budgetWindow('daily', lastMs).from).toBe(iso(local(2026, 10, 31)));
    expect(budgetWindow('monthly', lastMs).from).toBe(iso(local(2026, 10, 1)));
    const first = local(2026, 11, 1);
    expect(budgetWindow('daily', first)).toEqual({ from: iso(first), to: iso(first) });
    expect(budgetWindow('monthly', first).from).toBe(iso(first));
  });

  it('handles short months and the new year', () => {
    expect(budgetWindow('monthly', local(2027, 2, 28, 12)).from).toBe(iso(local(2027, 2, 1)));
    expect(budgetWindow('monthly', local(2027, 1, 1, 0, 0, 1)).from).toBe(iso(local(2027, 1, 1)));
    expect(budgetWindow('daily', local(2027, 1, 1, 0, 0, 1)).from).toBe(iso(local(2027, 1, 1)));
  });
});

const usage = (cost: number | null, unpricedModels: string[] = []): UsageSummary => ({
  inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, cost, unpricedModels, models: [],
});
const W = { from: '2026-10-01T04:00:00.000Z', to: '2026-10-13T19:30:00.000Z' };

describe('budgetLine', () => {
  it('is ok under 80%, warn from 80%, over from 100%', () => {
    expect(budgetLine('monthly', 20, W, usage(15.99))).toEqual({ period: 'monthly', limit: 20, spent: 15.99, ratio: 0.7995, level: 'ok', ...W, unpricedModels: [] });
    expect(budgetLine('monthly', 20, W, usage(16)).level).toBe('warn');
    expect(budgetLine('monthly', 20, W, usage(19.999)).level).toBe('warn');
    expect(budgetLine('monthly', 20, W, usage(20)).level).toBe('over');
    expect(budgetLine('monthly', 20, W, usage(31)).ratio).toBe(1.55);
  });

  it('is "unpriced" when nothing could be priced: no spend, no ratio, never over', () => {
    expect(budgetLine('daily', 1, W, usage(null, ['mystery-model']))).toEqual({
      period: 'daily', limit: 1, spent: null, ratio: null, level: 'unpriced', ...W, unpricedModels: ['mystery-model'],
    });
  });

  it('counts only the priced part when some models are unpriced, and says which ones it left out', () => {
    const partOk = budgetLine('monthly', 20, W, usage(2, ['mystery-model']));
    expect(partOk).toMatchObject({ spent: 2, level: 'unpriced', unpricedModels: ['mystery-model'] });
    expect(budgetLine('monthly', 20, W, usage(17, ['mystery-model'])).level).toBe('warn');
    expect(budgetLine('monthly', 20, W, usage(25, ['mystery-model'])).level).toBe('over'); // the priced part alone is over
  });

  it('is "no-data" when the adapter keeps no usage', () => {
    expect(budgetLine('monthly', 20, W, null)).toMatchObject({ spent: null, ratio: null, level: 'no-data', unpricedModels: [] });
  });

  it('a free (included) month is ok at $0', () => {
    expect(budgetLine('monthly', 20, W, usage(0))).toMatchObject({ spent: 0, ratio: 0, level: 'ok' });
  });
});

describe('worstLevel', () => {
  it('over beats warn beats unpriced beats no-data beats ok', () => {
    expect(worstLevel(['ok', 'warn'])).toBe('warn');
    expect(worstLevel(['unpriced', 'over', 'warn'])).toBe('over');
    expect(worstLevel(['no-data', 'unpriced'])).toBe('unpriced');
    expect(worstLevel([])).toBe('ok');
  });
});
