import { describe, expect, it } from 'vitest';
import { matchesDay, parseCron, type CronSpec } from './cron';

const spec = (expr: string): CronSpec => {
  const r = parseCron(expr);
  if (!r.ok) throw new Error(r.error);
  return r.spec;
};
const range = (lo: number, hi: number, step = 1) => Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);

describe('parseCron: fields', () => {
  it('expands * to the whole field', () => {
    const s = spec('* * * * *');
    expect(s.minutes).toEqual(range(0, 59));
    expect(s.hours).toEqual(range(0, 23));
    expect(s.daysOfMonth).toEqual(range(1, 31));
    expect(s.months).toEqual(range(1, 12));
    expect(s.daysOfWeek).toEqual(range(0, 6));
    expect(s.anyDayOfMonth && s.anyDayOfWeek).toBe(true);
  });

  it('reads single values, ranges and lists', () => {
    const s = spec('30 8 * * 1-5');
    expect(s.minutes).toEqual([30]);
    expect(s.hours).toEqual([8]);
    expect(s.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(spec('0 10,14,18 * * *').hours).toEqual([10, 14, 18]);
    expect(spec('0 9 1,15 * *').daysOfMonth).toEqual([1, 15]);
  });

  it('reads steps on *, on ranges and on a start value', () => {
    expect(spec('*/15 * * * *').minutes).toEqual([0, 15, 30, 45]);
    expect(spec('*/2 21-23 * * *').minutes).toEqual(range(0, 58, 2));
    expect(spec('0 8-18/4 * * *').hours).toEqual([8, 12, 16]);
    expect(spec('5/20 * * * *').minutes).toEqual([5, 25, 45]);
    expect(spec('0 0 */10 * *').daysOfMonth).toEqual([1, 11, 21, 31]);
  });

  it('mixes lists of ranges and steps, sorted and without duplicates', () => {
    expect(spec('0,30,15-20/5,30 * * * *').minutes).toEqual([0, 15, 20, 30]);
    expect(spec('0 0 * * 5,1-2').daysOfWeek).toEqual([1, 2, 5]);
  });

  it('treats day-of-week 7 as Sunday', () => {
    expect(spec('0 0 * * 7').daysOfWeek).toEqual([0]);
    expect(spec('0 0 * * 5-7').daysOfWeek).toEqual([0, 5, 6]);
  });

  it('accepts month and weekday names, any case', () => {
    expect(spec('0 9 * jan,JUL *').months).toEqual([1, 7]);
    expect(spec('0 9 * * Mon-Fri').daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(spec('0 9 * * sun').daysOfWeek).toEqual([0]);
  });

  it('expands the @ shortcuts', () => {
    expect(spec('@hourly')).toEqual(spec('0 * * * *'));
    expect(spec('@daily')).toEqual(spec('0 0 * * *'));
    expect(spec('@midnight')).toEqual(spec('0 0 * * *'));
    expect(spec('@weekly')).toEqual(spec('0 0 * * 0'));
    expect(spec('@monthly')).toEqual(spec('0 0 1 * *'));
    expect(spec('@yearly')).toEqual(spec('0 0 1 1 *'));
    expect(spec('@annually')).toEqual(spec('0 0 1 1 *'));
  });

  it('tolerates extra whitespace', () => {
    expect(spec('  30   8 * *\t1-5 ')).toEqual(spec('30 8 * * 1-5'));
  });
});

describe('parseCron: rejects what cron would reject', () => {
  it.each([
    ['', /5 fields/],
    ['* * * *', /5 fields/],
    ['0 * * * * *', /5 fields/], // seconds field
    ['60 * * * *', /minute/],
    ['* 24 * * *', /hour/],
    ['* * 0 * *', /day of month/],
    ['* * 32 * *', /day of month/],
    ['* * * 13 *', /month/],
    ['* * * * 8', /day of week/],
    ['5-1 * * * *', /minute/], // reversed range
    ['*/0 * * * *', /minute/], // zero step
    ['*/x * * * *', /minute/],
    ['1-2-3 * * * *', /minute/],
    ['1/2/3 * * * *', /minute/],
    [', * * * *', /minute/],
    ['* * * foo *', /month/],
    ['@reboot', /@reboot/],
    ['every 5m', /5 fields/],
  ])('%j', (expr, error) => {
    const r = parseCron(expr);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(error);
  });
});

describe('matchesDay: day-of-month and day-of-week', () => {
  // 2026-10-13 is a Tuesday; 2026-10-15 a Thursday; 2026-10-01 a Thursday.
  it('uses day of week alone when day of month is *', () => {
    const s = spec('0 9 * * 2');
    expect(matchesDay(s, 2026, 10, 13)).toBe(true);
    expect(matchesDay(s, 2026, 10, 14)).toBe(false);
  });

  it('uses day of month alone when day of week is *', () => {
    const s = spec('0 9 15 * *');
    expect(matchesDay(s, 2026, 10, 15)).toBe(true);
    expect(matchesDay(s, 2026, 10, 13)).toBe(false);
  });

  it('matches EITHER when both are restricted (cron OR rule)', () => {
    const s = spec('0 9 1 * 2'); // the 1st of the month, and every Tuesday
    expect(matchesDay(s, 2026, 10, 1)).toBe(true); // a Thursday, but the 1st
    expect(matchesDay(s, 2026, 10, 13)).toBe(true); // a Tuesday
    expect(matchesDay(s, 2026, 10, 15)).toBe(false);
  });

  it('checks the month and skips days a month does not have', () => {
    const s = spec('0 0 31 * *');
    expect(matchesDay(s, 2026, 10, 31)).toBe(true);
    expect(matchesDay(s, 2026, 11, 31)).toBe(false); // there is no 31 November
    expect(matchesDay(spec('0 0 29 2 *'), 2027, 2, 29)).toBe(false);
    expect(matchesDay(spec('0 0 29 2 *'), 2028, 2, 29)).toBe(true);
    expect(matchesDay(spec('0 0 * 3 *'), 2026, 10, 13)).toBe(false);
  });
});
