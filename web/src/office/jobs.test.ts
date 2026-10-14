import { describe, expect, it } from 'vitest';
import type { ScheduledJob } from '@shared/contract';
import { jobTiming } from './jobs';

const NOW = Date.parse('2026-10-13T12:00:00.000Z');
const job = (over: Partial<ScheduledJob> = {}): ScheduledJob => ({ name: 'weekly-review', schedule: '0 19 * * 0', enabled: true, ...over });

describe('jobTiming (the "last … · next …" line under a scheduled job)', () => {
  it('shows the last run with its status and the next run ahead', () => {
    expect(jobTiming(job({ lastRunAt: '2026-10-13T08:00:00.000Z', lastStatus: 'ok', nextRunAt: '2026-10-14T08:00:00.000Z' }), NOW))
      .toBe('last 4 h ago (ok) · next in 20 h');
    expect(jobTiming(job({ nextRunAt: '2026-10-13T12:30:00.000Z' }), NOW)).toBe('next in 30 min');
    expect(jobTiming(job({ nextRunAt: '2026-10-18T12:00:00.000Z' }), NOW)).toBe('next in 5 d');
  });

  it('never says "next … ago": a paused job has no next run, an overdue one is due now', () => {
    const past = { lastRunAt: '2026-10-08T12:00:00.000Z', lastStatus: 'ok', nextRunAt: '2026-10-09T12:00:00.000Z' };
    expect(jobTiming(job({ ...past, enabled: false }), NOW)).toBe('last 5 d ago (ok)');
    expect(jobTiming(job({ ...past, enabled: true }), NOW)).toBe('last 5 d ago (ok) · next due now');
  });

  it('is empty when nothing is known, and ignores bad dates', () => {
    expect(jobTiming(job(), NOW)).toBe('');
    expect(jobTiming(job({ lastRunAt: 'not a date', nextRunAt: 'later' }), NOW)).toBe('');
  });
});
