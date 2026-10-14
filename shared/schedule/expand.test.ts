import { describe, expect, it } from 'vitest';
import { parseCron, type CronSpec } from './cron';
import { cronTimes, intervalTimes, onceTime, ruleFromText } from './expand';

const NY = 'America/New_York';
const spec = (expr: string): CronSpec => {
  const r = parseCron(expr);
  if (!r.ok) throw new Error(r.error);
  return r.spec;
};
const span = (from: string, to: string) => ({ from: Date.parse(from), to: Date.parse(to) });
const isos = (times: ReadonlyArray<number>) => times.map((t) => new Date(t).toISOString().replace(':00.000Z', 'Z'));

describe('cronTimes', () => {
  it('expands weekdays at 08:30 New York time into UTC instants', () => {
    const r = cronTimes(spec('30 8 * * 1-5'), NY, span('2026-10-12T04:00:00Z', '2026-10-19T04:00:00Z'), 100);
    expect(isos(r.times)).toEqual(['2026-10-12T12:30Z', '2026-10-13T12:30Z', '2026-10-14T12:30Z', '2026-10-15T12:30Z', '2026-10-16T12:30Z']);
    expect(r.truncated).toBe(false);
  });

  it('includes the start of the span and excludes its end', () => {
    const r = cronTimes(spec('0 * * * *'), 'UTC', span('2026-10-13T10:00:00Z', '2026-10-13T13:00:00Z'), 100);
    expect(isos(r.times)).toEqual(['2026-10-13T10:00Z', '2026-10-13T11:00Z', '2026-10-13T12:00Z']);
  });

  it('lists, ranges and steps together', () => {
    const r = cronTimes(spec('0 10,14,18 * * *'), 'UTC', span('2026-10-13T00:00:00Z', '2026-10-14T00:00:00Z'), 100);
    expect(isos(r.times)).toEqual(['2026-10-13T10:00Z', '2026-10-13T14:00Z', '2026-10-13T18:00Z']);
    const steps = cronTimes(spec('*/20 21-22 * * *'), 'UTC', span('2026-10-13T00:00:00Z', '2026-10-14T00:00:00Z'), 100);
    expect(steps.times).toHaveLength(6);
  });

  it('spring forward: a job in the skipped hour runs once, right after the gap', () => {
    const r = cronTimes(spec('30 2 * * *'), NY, span('2026-03-07T05:00:00Z', '2026-03-10T04:00:00Z'), 100);
    expect(isos(r.times)).toEqual(['2026-03-07T07:30Z', '2026-03-08T07:30Z', '2026-03-09T06:30Z']);
  });

  it('spring forward: times that collapse onto the same instant are listed once', () => {
    const r = cronTimes(spec('0,30 2-3 * * *'), NY, span('2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z'), 100);
    expect(isos(r.times)).toEqual(['2026-03-08T07:00Z', '2026-03-08T07:30Z']);
  });

  it('fall back: a job in the repeated hour runs once, the first time round', () => {
    const r = cronTimes(spec('30 1 * * *'), NY, span('2026-10-31T04:00:00Z', '2026-11-03T05:00:00Z'), 100);
    expect(isos(r.times)).toEqual(['2026-10-31T05:30Z', '2026-11-01T05:30Z', '2026-11-02T06:30Z']);
  });

  it('fall back: an hourly job runs once per local hour on the 25-hour day', () => {
    const r = cronTimes(spec('0 * * * *'), NY, span('2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z'), 100);
    expect(r.times).toHaveLength(24); // 01:00 runs once (the first time round), so 24 distinct hours
    expect(new Set(r.times).size).toBe(r.times.length);
  });

  it('skips days a month does not have and applies the day-of-month OR day-of-week rule', () => {
    const r = cronTimes(spec('0 0 31 * *'), 'UTC', span('2026-10-01T00:00:00Z', '2027-01-01T00:00:00Z'), 100);
    expect(isos(r.times)).toEqual(['2026-10-31T00:00Z', '2026-12-31T00:00Z']);
    const either = cronTimes(spec('0 9 1 * 1'), 'UTC', span('2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z'), 100);
    expect(isos(either.times)).toEqual(['2026-10-01T09:00Z', '2026-10-05T09:00Z', '2026-10-12T09:00Z', '2026-10-19T09:00Z', '2026-10-26T09:00Z']);
  });

  it('stops at the limit and says so', () => {
    const r = cronTimes(spec('* * * * *'), NY, span('2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z'), 50);
    expect(r.times).toHaveLength(50);
    expect(r.truncated).toBe(true);
    expect(isos(r.times.slice(0, 2))).toEqual(['2026-10-01T00:00Z', '2026-10-01T00:01Z']);
  });

  it('is empty for an empty or reversed span', () => {
    expect(cronTimes(spec('* * * * *'), 'UTC', span('2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z'), 10).times).toEqual([]);
    expect(cronTimes(spec('* * * * *'), 'UTC', span('2026-10-02T00:00:00Z', '2026-10-01T00:00:00Z'), 10).times).toEqual([]);
  });
});

describe('intervalTimes', () => {
  const anchor = Date.parse('2026-10-13T12:06:00Z');
  it('steps forward and back from the anchor, inside the span', () => {
    const r = intervalTimes(30, anchor, span('2026-10-13T11:00:00Z', '2026-10-13T13:00:00Z'), 100);
    expect(isos(r.times)).toEqual(['2026-10-13T11:06Z', '2026-10-13T11:36Z', '2026-10-13T12:06Z', '2026-10-13T12:36Z']);
  });

  it('respects the limit and rejects silly steps', () => {
    expect(intervalTimes(1, anchor, span('2026-10-13T00:00:00Z', '2026-10-14T00:00:00Z'), 10)).toMatchObject({ truncated: true });
    expect(intervalTimes(0, anchor, span('2026-10-13T00:00:00Z', '2026-10-14T00:00:00Z'), 10).times).toEqual([]);
    expect(intervalTimes(Number.NaN, anchor, span('2026-10-13T00:00:00Z', '2026-10-14T00:00:00Z'), 10).times).toEqual([]);
  });
});

describe('onceTime', () => {
  it('reads an instant with an offset, or a wall time in the job zone', () => {
    expect(onceTime('2026-10-09T14:00:00-04:00', 'UTC')).toBe(Date.parse('2026-10-09T18:00:00Z'));
    expect(onceTime('2026-10-09T14:00', NY)).toBe(Date.parse('2026-10-09T18:00:00Z'));
    expect(onceTime('not a date', NY)).toBeNull();
  });
});

describe('ruleFromText: schedules written as text (Hermes schedule_display, other adapters)', () => {
  it.each([
    ['30 8 * * 1-5', { kind: 'cron', expr: '30 8 * * 1-5' }],
    ['@daily', { kind: 'cron', expr: '@daily' }],
    ['every 5m', { kind: 'interval', minutes: 5 }],
    ['every 30 min', { kind: 'interval', minutes: 30 }],
    ['Every 2 h', { kind: 'interval', minutes: 120 }],
    ['every 1d', { kind: 'interval', minutes: 1440 }],
    ['Hourly', { kind: 'interval', minutes: 60 }],
    ['once at 2026-10-06 12:30', { kind: 'once', at: '2026-10-06T12:30' }],
  ])('%j', (text, rule) => {
    expect(ruleFromText(text)).toEqual(rule);
  });

  it.each(['every friday 9am', 'Weekdays 08:00', '', '61 * * * *', 'every 0m'])('%j is not understood', (text) => {
    expect(ruleFromText(text)).toBeNull();
  });
});
