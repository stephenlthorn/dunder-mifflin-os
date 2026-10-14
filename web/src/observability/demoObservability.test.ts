import { describe, expect, it } from 'vitest';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { parseTimeline, parseUsageReport } from '../data/observabilityGuards';
import { demoTimeline, demoUsage } from './demoObservability';

describe('demo timeline and ledger', () => {
  it('gives every demo bot a valid timeline, newest first, and nobody without a bot', () => {
    for (const p of DEMO_SNAPSHOT.people) {
      const t = demoTimeline(DEMO_SNAPSHOT, p.id);
      expect(parseTimeline(t), p.id).toEqual(t);
      if (!p.bot) {
        expect(t).toMatchObject({ available: false, reason: 'No bot yet' });
        continue;
      }
      expect(t.events.length, p.id).toBeGreaterThan(2);
      const times = t.events.map((e) => Date.parse(e.at));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
    }
  });

  it('tells Dwight\'s day with a failed campaign report', () => {
    const t = demoTimeline(DEMO_SNAPSHOT, 'dwight');
    expect(t.events.some((e) => e.kind === 'cron.fail' && e.title === 'Weekly campaign report')).toBe(true);
  });

  it('makes a valid usage report per period, growing with the period, with one unpriced bot', () => {
    const today = demoUsage(DEMO_SNAPSHOT, 'today');
    const month = demoUsage(DEMO_SNAPSHOT, '30d');
    expect(parseUsageReport(month)).toEqual(month);
    expect(month.rows).toHaveLength(12);
    expect(month.totals.inputTokens).toBeGreaterThan(today.totals.inputTokens);
    expect(month.totals.unpricedModels).toEqual(['MiniMax-M3.1-Flash-Preview']);
    expect(month.rows.find((r) => r.personId === 'sadiq')?.usage?.cost).toBeNull();
  });
});
