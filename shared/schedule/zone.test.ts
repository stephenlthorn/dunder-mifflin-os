import { describe, expect, it } from 'vitest';
import { addDays, fromWallTime, isTimeZone, offsetMs, wallTime } from './zone';

const NY = 'America/New_York';
const LON = 'Europe/London';
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('wallTime', () => {
  it('reads the local calendar fields of an instant in a zone', () => {
    const t = Date.parse('2026-10-13T16:11:02Z');
    expect(wallTime(t, NY)).toEqual({ year: 2026, month: 10, day: 13, hour: 12, minute: 11, weekday: 2 });
    expect(wallTime(t, 'Asia/Kolkata')).toMatchObject({ hour: 21, minute: 41 }); // +05:30
    expect(wallTime(t, 'UTC')).toMatchObject({ hour: 16, minute: 11 });
  });

  it('crosses midnight into the next local day', () => {
    expect(wallTime(Date.parse('2026-10-14T03:30:00Z'), NY)).toMatchObject({ day: 13, hour: 23, minute: 30 });
    expect(wallTime(Date.parse('2026-10-13T23:30:00Z'), 'Asia/Tokyo')).toMatchObject({ day: 14, hour: 8 });
  });
});

describe('offsetMs', () => {
  it('is the zone offset at that instant, DST included', () => {
    expect(offsetMs(Date.parse('2026-01-15T12:00:00Z'), NY)).toBe(-5 * H);
    expect(offsetMs(Date.parse('2026-07-15T12:00:00Z'), NY)).toBe(-4 * H);
    expect(offsetMs(Date.parse('2026-07-15T12:00:00Z'), LON)).toBe(1 * H);
    expect(offsetMs(Date.parse('2026-07-15T12:00:00Z'), 'Asia/Kolkata')).toBe(5.5 * H);
  });
});

describe('fromWallTime', () => {
  it('turns a local time into the instant, in either half of the year', () => {
    expect(iso(fromWallTime({ year: 2026, month: 10, day: 13, hour: 8, minute: 30 }, NY))).toBe('2026-10-13T12:30:00.000Z');
    expect(iso(fromWallTime({ year: 2026, month: 1, day: 13, hour: 8, minute: 30 }, NY))).toBe('2026-01-13T13:30:00.000Z');
    expect(iso(fromWallTime({ year: 2026, month: 10, day: 13, hour: 8, minute: 30 }, 'Asia/Kolkata'))).toBe('2026-10-13T03:00:00.000Z');
  });

  it('spring forward: a skipped local time runs right after the gap (02:30 -> 03:30 EDT)', () => {
    // New York skips 02:00-02:59 on 2026-03-08
    expect(iso(fromWallTime({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, NY))).toBe('2026-03-08T07:30:00.000Z');
    expect(iso(fromWallTime({ year: 2026, month: 3, day: 8, hour: 3, minute: 30 }, NY))).toBe('2026-03-08T07:30:00.000Z');
    expect(iso(fromWallTime({ year: 2026, month: 3, day: 8, hour: 1, minute: 59 }, NY))).toBe('2026-03-08T06:59:00.000Z');
    // London skips 01:00-01:59 on 2026-03-29
    expect(iso(fromWallTime({ year: 2026, month: 3, day: 29, hour: 1, minute: 15 }, LON))).toBe('2026-03-29T01:15:00.000Z');
  });

  it('fall back: a repeated local time means its first occurrence (01:30 EDT, not EST)', () => {
    // New York repeats 01:00-01:59 on 2026-11-01
    expect(iso(fromWallTime({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, NY))).toBe('2026-11-01T05:30:00.000Z');
    expect(iso(fromWallTime({ year: 2026, month: 11, day: 1, hour: 2, minute: 0 }, NY))).toBe('2026-11-01T07:00:00.000Z');
    // London repeats 01:00-01:59 on 2026-10-25
    expect(iso(fromWallTime({ year: 2026, month: 10, day: 25, hour: 1, minute: 30 }, LON))).toBe('2026-10-25T00:30:00.000Z');
  });

  it('round-trips with wallTime away from transitions', () => {
    for (const t of ['2026-02-01T00:00:00Z', '2026-06-30T23:59:00Z', '2026-12-31T12:00:00Z']) {
      const ms = Date.parse(t);
      const w = wallTime(ms, NY);
      expect(fromWallTime(w, NY)).toBe(ms);
    }
  });
});

describe('addDays and isTimeZone', () => {
  it('adds calendar days to a date, across month and year ends', () => {
    expect(addDays({ year: 2026, month: 10, day: 30 }, 3)).toEqual({ year: 2026, month: 11, day: 2 });
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(addDays({ year: 2026, month: 3, day: 1 }, -1)).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it('knows real IANA zones', () => {
    expect(isTimeZone(NY)).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isTimeZone('')).toBe(false);
  });
});
