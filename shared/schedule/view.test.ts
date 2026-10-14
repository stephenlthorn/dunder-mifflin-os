import { describe, expect, it } from 'vitest';
import type { ScheduledJob } from '../contract';
import { buildScheduleView, runOf } from './view';

const NY = 'America/New_York';
// Tuesday 2026-10-13, 12:11 in New York
const NOW = Date.parse('2026-10-13T16:11:00Z');
const WEEK = { from: Date.parse('2026-10-12T04:00:00Z'), to: Date.parse('2026-10-19T04:00:00Z') };
const job = (j: Partial<ScheduledJob>): ScheduledJob => ({ name: 'Morning report', schedule: '30 8 * * 1-5', enabled: true, ...j });
const build = (jobs: Record<string, ScheduledJob[]>, span = WEEK) => buildScheduleView({ jobs, span, now: NOW, defaultTimeZone: NY });
const runs = (v: ReturnType<typeof build>, key: string) => v.occurrences.filter((o) => o.jobKey === key).map((o) => [o.at.slice(0, 16), o.run]);

describe('buildScheduleView', () => {
  it('expands a cron job and marks the last run, missed runs and upcoming runs', () => {
    const v = build({ pam: [job({ lastRunAt: '2026-10-12T08:30:38-04:00', lastStatus: 'ok', nextRunAt: '2026-10-14T08:30:00-04:00' })] });
    expect(v.jobs).toEqual([expect.objectContaining({ key: 'pam-0', personId: 'pam', name: 'Morning report', repeats: 'cron', timeZone: NY })]);
    expect(runs(v, 'pam-0')).toEqual([
      ['2026-10-12T12:30', 'ok'], // Monday: the recorded last run
      ['2026-10-13T12:30', 'missed'], // Tuesday 08:30 came and went with no run after Monday's
      ['2026-10-14T12:30', 'upcoming'],
      ['2026-10-15T12:30', 'upcoming'],
      ['2026-10-16T12:30', 'upcoming'],
    ]);
    expect(v.from).toBe('2026-10-12T04:00:00.000Z');
    expect(v.timeZone).toBe(NY);
  });

  it('a failed last run is failed on the calendar', () => {
    const v = build({ sadiq: [job({ schedule: '0 * * * *', lastRunAt: '2026-10-13T12:02:10-04:00', lastStatus: 'error: gateway timeout' })] });
    const last = v.occurrences.find((o) => o.at === '2026-10-13T16:00:00.000Z');
    expect(last?.run).toBe('failed');
    expect(v.occurrences.filter((o) => o.run === 'failed')).toHaveLength(1);
    expect(v.occurrences.find((o) => o.at === '2026-10-13T15:00:00.000Z')?.run).toBe('unknown'); // before the last run: not recorded
  });

  it('a run that was due a few minutes ago but has not been recorded yet is not called missed', () => {
    const v = build({ pam: [job({ schedule: '5 12 * * *', lastRunAt: '2026-10-12T12:05:30-04:00', lastStatus: 'ok' })] });
    expect(v.occurrences.find((o) => o.at === '2026-10-13T16:05:00.000Z')?.run).toBe('upcoming');
  });

  it('a manual run off the schedule shows at its own time', () => {
    const v = build({ pam: [job({ lastRunAt: '2026-10-13T02:00:00-04:00', lastStatus: 'ok' })] });
    expect(v.occurrences.find((o) => o.at === '2026-10-13T06:00:00.000Z')).toMatchObject({ run: 'ok', offSchedule: true });
  });

  it('a paused job shows only its last run', () => {
    const v = build({ pam: [job({ enabled: false, lastRunAt: '2026-10-12T08:31:00-04:00', lastStatus: 'ok' })] });
    expect(runs(v, 'pam-0')).toEqual([['2026-10-12T12:31', 'ok']]);
  });

  it('a schedule it cannot read still shows the last and next run', () => {
    const v = build({ dwight: [job({ schedule: 'every friday 9am', lastRunAt: '2026-10-09T09:04:00-04:00', nextRunAt: '2026-10-16T09:00:00-04:00' })] });
    expect(v.jobs[0]?.repeats).toBe('unknown');
    expect(runs(v, 'dwight-0')).toEqual([['2026-10-16T13:00', 'upcoming']]);
  });

  it('an interval job steps from its next run; a rule from the adapter wins over the text', () => {
    const v = build({ kelly: [job({ schedule: 'every 2 h', rule: { kind: 'interval', minutes: 360 }, nextRunAt: '2026-10-13T13:00:00-04:00' })] },
      { from: Date.parse('2026-10-13T04:00:00Z'), to: Date.parse('2026-10-14T04:00:00Z') });
    expect(v.occurrences.map((o) => o.at.slice(11, 16))).toEqual(['05:00', '11:00', '17:00', '23:00']);
  });

  it('runs a cron rule in the job zone, falling back to the default zone for a bad one', () => {
    const day = { from: Date.parse('2026-10-13T00:00:00Z'), to: Date.parse('2026-10-14T00:00:00Z') };
    const v = build({
      ira: [job({ schedule: '0 9 * * *', timeZone: 'Asia/Tokyo' })],
      oscar: [job({ schedule: '0 9 * * *', timeZone: 'Not/AZone' })],
    }, day);
    expect(v.occurrences.map((o) => [o.jobKey, o.at])).toEqual([['ira-0', '2026-10-13T00:00:00.000Z'], ['oscar-0', '2026-10-13T13:00:00.000Z']]);
    expect(v.jobs.map((j) => j.timeZone)).toEqual(['Asia/Tokyo', NY]);
  });

  it('flags the soonest run after now as next up, even when it is outside the span', () => {
    const jobs = {
      pam: [job({ nextRunAt: '2026-10-14T08:30:00-04:00' })],
      kelly: [job({ name: 'Post queue', schedule: '0 */2 * * *' })], // next: 14:00 today
      ryan: [job({ name: 'Paused', enabled: false, nextRunAt: '2026-10-13T12:30:00-04:00' })],
    };
    const v = build(jobs);
    expect(v.nextUp).toEqual({ jobKey: 'kelly-0', at: '2026-10-13T18:00:00.000Z' });
    expect(v.occurrences.filter((o) => o.nextUp)).toEqual([expect.objectContaining({ jobKey: 'kelly-0', at: '2026-10-13T18:00:00.000Z' })]);
    const later = build(jobs, { from: Date.parse('2026-10-20T04:00:00Z'), to: Date.parse('2026-10-21T04:00:00Z') });
    expect(later.nextUp?.jobKey).toBe('kelly-0');
    expect(later.occurrences.some((o) => o.nextUp)).toBe(false);
  });

  it('caps a busy calendar and says it is truncated', () => {
    const v = buildScheduleView({
      jobs: { kelly: [job({ schedule: '* * * * *' })], pam: [job({ schedule: '*/2 * * * *' })] },
      span: WEEK, now: NOW, defaultTimeZone: NY, limits: { perJob: 100, total: 150 },
    });
    expect(v.occurrences).toHaveLength(150);
    expect(v.truncated).toBe(true);
    const times = v.occurrences.map((o) => o.at);
    expect([...times].sort()).toEqual(times);
  });

  it('copies no fields it was not given and keeps the input untouched', () => {
    const input = { pam: [Object.freeze(job({}))] };
    const v = build(input);
    expect(Object.keys(v.jobs[0] ?? {}).sort()).toEqual(['enabled', 'key', 'name', 'personId', 'repeats', 'schedule', 'timeZone']);
    expect(input.pam[0]).toEqual(job({}));
  });
});

describe('runOf', () => {
  it.each([
    ['ok', 'ok'], ['OK', 'ok'], ['success', 'ok'], ['completed', 'ok'],
    ['error', 'failed'], ['error: gateway timeout', 'failed'], ['failed', 'failed'], ['crashed', 'failed'], ['timed_out', 'failed'],
    ['skipped', 'unknown'], [undefined, 'unknown'],
  ])('%j -> %s', (status, run) => {
    expect(runOf(status)).toBe(run);
  });
});
