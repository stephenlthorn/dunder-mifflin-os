import { describe, expect, it } from 'vitest';
import type { CalendarJob } from '@shared/contract';
import { RUN_META, inText, repeatsText } from './words';

const job = (j: Partial<CalendarJob>): CalendarJob => ({
  key: 'pam-0', personId: 'pam', name: 'Digest', schedule: '30 8 * * 1-5', repeats: 'cron', enabled: true, timeZone: 'America/New_York', ...j,
});

describe('repeatsText', () => {
  it('says how a job repeats, in words where it can', () => {
    expect(repeatsText(job({}))).toBe('cron 30 8 * * 1-5');
    expect(repeatsText(job({ repeats: 'interval', schedule: 'every 30m' }))).toBe('every 30m');
    expect(repeatsText(job({ repeats: 'once', schedule: 'once at 2026-10-06 12:30' }))).toBe('once at 2026-10-06 12:30');
    expect(repeatsText(job({ repeats: 'unknown', schedule: 'every friday 9am' }))).toBe('every friday 9am');
    expect(repeatsText(job({ enabled: false }))).toBe('cron 30 8 * * 1-5 · paused');
    expect(repeatsText(job({ schedule: 'Fridays at 9' }))).toBe('Fridays at 9'); // a cron rule shown in its own words
  });
});

describe('inText', () => {
  it('says how long until a run', () => {
    const now = Date.parse('2026-10-13T15:00:00Z');
    expect(inText('2026-10-13T15:00:30Z', now)).toBe('now');
    expect(inText('2026-10-13T15:45:00Z', now)).toBe('in 45 min');
    expect(inText('2026-10-13T17:30:00Z', now)).toBe('in 2 h 30 min');
    expect(inText('2026-10-13T17:00:00Z', now)).toBe('in 2 h');
    expect(inText('2026-10-16T15:00:00Z', now)).toBe('in 3 days');
  });
});

describe('RUN_META', () => {
  it('pairs every run state with an icon and words, so colour is never the only cue', () => {
    for (const run of ['ok', 'failed', 'missed', 'unknown', 'upcoming'] as const) {
      expect(RUN_META[run].icon.length).toBeGreaterThan(0);
      expect(RUN_META[run].word.length).toBeGreaterThan(0);
    }
  });
});
