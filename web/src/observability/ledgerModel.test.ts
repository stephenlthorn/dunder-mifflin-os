import { describe, expect, it } from 'vitest';
import type { UsageReport, UsageRow, UsageSummary } from '@shared/observability';
import { formatTokens, formatUsd, ledgerView } from './ledgerModel';

const summary = (inputTokens: number, outputTokens: number, cost: number | null, unpricedModels: string[] = []): UsageSummary => ({
  inputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0, cost, unpricedModels, models: [],
});
const row = (personId: string, usage: UsageSummary | null, adapterLabel = 'Hermes'): UsageRow => ({
  personId, name: personId, adapterId: adapterLabel.toLowerCase(), adapterLabel, usage, ...(usage ? {} : { unavailable: `No usage data from ${adapterLabel}` }),
});
const report = (rows: UsageRow[]): UsageReport => ({
  period: '7d', from: '2026-10-06T15:00:00.000Z', to: '2026-10-13T15:00:00.000Z', generatedAt: '2026-10-13T15:00:00.000Z', currency: 'USD', estimate: true,
  priceTable: { asOf: '2026-10-06', source: 'test', models: 3 }, rows,
  totals: summary(rows.reduce((n, r) => n + (r.usage?.inputTokens ?? 0), 0), rows.reduce((n, r) => n + (r.usage?.outputTokens ?? 0), 0), 13, ['mystery']),
});

describe('formatUsd / formatTokens', () => {
  it('prints money and token counts compactly', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(0.004)).toBe('<$0.01');
    expect(formatUsd(12.345)).toBe('$12.35');
    expect(formatUsd(1234.5)).toBe('$1,235');
    expect(formatUsd(null)).toBe('—');
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(12_400)).toBe('12.4k');
    expect(formatTokens(3_456_789)).toBe('3.5M');
    expect(formatTokens(2_100_000_000)).toBe('2.1B');
  });
});

describe('ledgerView', () => {
  const rows = [row('kelly', summary(1000, 100, 2)), row('dwight', summary(5000, 500, 10)), row('jim', null, 'Claude Code'), row('pam', summary(9000, 900, null, ['MiniMax-M3']))];

  it('by cost: biggest spender first, bars to scale, unpriced and unavailable after', () => {
    const v = ledgerView(report(rows), 'cost');
    expect(v.rows.map((r) => [r.personId, r.bar])).toEqual([['dwight', 1], ['kelly', 0.2], ['pam', 0], ['jim', 0]]);
    expect(v.rows.find((r) => r.personId === 'pam')).toMatchObject({ valueText: '—', note: 'No price for MiniMax-M3' });
    expect(v.rows.find((r) => r.personId === 'jim')).toMatchObject({ valueText: '', note: 'No usage data from Claude Code', available: false });
    expect(v.totalText).toBe('$13.00');
    expect(v.partial).toBe(true);
  });

  it('by tokens: everyone with usage is to scale, unavailable rows still last', () => {
    const v = ledgerView(report(rows), 'tokens');
    expect(v.rows.map((r) => r.personId)).toEqual(['pam', 'dwight', 'kelly', 'jim']);
    expect(v.rows[0]).toMatchObject({ bar: 1, valueText: '9.9k' });
    expect(v.rows[1]?.bar).toBeCloseTo(5500 / 9900, 6);
    expect(v.totalText).toBe('16.5k');
  });

  it('marks a partly priced bot and copes with nobody having used anything', () => {
    const partly = ledgerView(report([row('a', summary(10, 10, 1, ['x']))]), 'cost');
    expect(partly.rows[0]).toMatchObject({ valueText: '$1.00', note: 'Plus unpriced x' });
    const empty = ledgerView(report([row('a', summary(0, 0, 0))]), 'cost');
    expect(empty.rows[0]?.bar).toBe(0);
  });
});
