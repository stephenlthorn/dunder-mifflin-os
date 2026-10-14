import { describe, expect, it } from 'vitest';
import { parseTimeline, parseUsageReport } from './observabilityGuards';

const summary = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 100, cacheWriteTokens: 0, cost: 1.5, unpricedModels: ['x'],
  models: [{ model: 'claude-opus-5-5', inputTokens: 10, outputTokens: 5, cacheReadTokens: 100, cacheWriteTokens: 0, cost: 1.5, costSource: 'price-table', calls: 2 }] };

describe('parseTimeline', () => {
  it('keeps well-formed events and drops the rest', () => {
    const t = parseTimeline({
      personId: 'dwight', available: true, since: '2026-10-13T00:00:00Z', truncated: true, adapter: { id: 'hermes', label: 'Hermes' },
      events: [
        { id: 'a', at: '2026-10-13T10:00:00Z', kind: 'cron.ok', title: 'Lead digest', detail: 'delivered', source: 'cron', count: 2 },
        { id: 'b', at: 'not a time', kind: 'cron.ok', title: 'x' },
        { id: 'c', at: '2026-10-13T10:00:00Z', kind: 'telepathy', title: 'x' },
        { id: 'd', at: '2026-10-13T10:00:00Z', kind: 'error', title: 'y'.repeat(500), count: -3 },
        'junk',
      ],
    });
    expect(t?.events.map((e) => e.id)).toEqual(['a', 'd']);
    expect(t?.events[1]?.title).toHaveLength(200);
    expect(t?.events[1]).not.toHaveProperty('count');
    expect(t).toMatchObject({ personId: 'dwight', available: true, truncated: true, adapter: { id: 'hermes', label: 'Hermes' } });
  });

  it('refuses something that is not a timeline', () => {
    expect(parseTimeline(null)).toBeNull();
    expect(parseTimeline({ personId: 'x', events: 'nope' })).toBeNull();
    expect(parseTimeline({ personId: 'x', available: false, reason: 'No bot yet', since: 's', events: [] })).toMatchObject({ reason: 'No bot yet', events: [] });
  });
});

describe('parseUsageReport', () => {
  const good = {
    period: '7d', from: 'f', to: 't', generatedAt: 'g', currency: 'USD', estimate: true, priceTable: { asOf: '2026-10-06', source: 's', models: 9 },
    rows: [
      { personId: 'dwight', name: 'Dwight Schrute', adapterId: 'hermes', adapterLabel: 'Hermes', usage: summary },
      { personId: 'temp-cc', name: 'paper-site', adapterId: 'claude-code', adapterLabel: 'Claude Code', usage: null, unavailable: 'No usage data from Claude Code' },
      { personId: 'bad', usage: summary },
    ],
    totals: summary,
  };

  it('keeps valid rows, null usage with its reason, and the totals', () => {
    const r = parseUsageReport(good);
    expect(r?.rows.map((x) => x.personId)).toEqual(['dwight', 'temp-cc']);
    expect(r?.rows[1]).toMatchObject({ usage: null, unavailable: 'No usage data from Claude Code' });
    expect(r?.rows[0]?.usage?.models[0]).toMatchObject({ model: 'claude-opus-5-5', cost: 1.5, costSource: 'price-table', calls: 2 });
    expect(r?.totals.cost).toBe(1.5);
    expect(r?.priceTable).toEqual({ asOf: '2026-10-06', source: 's', models: 9 });
  });

  it('refuses bad periods, totals or numbers', () => {
    expect(parseUsageReport({ ...good, period: '1y' })).toBeNull();
    expect(parseUsageReport({ ...good, totals: { ...summary, inputTokens: -1 } })).toBeNull();
    expect(parseUsageReport({ ...good, totals: { ...summary, cost: 'lots' } })).toBeNull();
    expect(parseUsageReport('nope')).toBeNull();
  });
});
