import { describe, expect, it } from 'vitest';
import { parsePeriod, timelineSince, usageWindow } from '../../src/usage/periods.ts';

const NOW = new Date(2026, 9, 13, 15, 30, 0).getTime(); // 13 Oct 2026, 15:30 local time

describe('usageWindow', () => {
  it('today runs from local midnight to now', () => {
    expect(usageWindow('today', NOW)).toEqual({ from: new Date(2026, 9, 13).toISOString(), to: new Date(NOW).toISOString() });
  });

  it('7d and 30d are rolling windows ending now', () => {
    expect(usageWindow('7d', NOW).from).toBe(new Date(NOW - 7 * 86_400_000).toISOString());
    expect(usageWindow('30d', NOW).from).toBe(new Date(NOW - 30 * 86_400_000).toISOString());
  });
});

describe('parsePeriod', () => {
  it('accepts the three periods, defaults to today and refuses anything else', () => {
    expect(parsePeriod(null)).toEqual({ ok: true, period: 'today' });
    expect(parsePeriod('7d')).toEqual({ ok: true, period: '7d' });
    expect(parsePeriod('30d')).toEqual({ ok: true, period: '30d' });
    expect(parsePeriod('1y')).toMatchObject({ ok: false });
    expect(parsePeriod('today; drop')).toMatchObject({ ok: false });
  });
});

describe('timelineSince', () => {
  it('defaults to the last 24 hours and the default limit', () => {
    expect(timelineSince(null, null, NOW)).toEqual({ ok: true, since: new Date(NOW - 86_400_000).toISOString(), limit: 200 });
  });

  it('takes an ISO since and a limit, clamped to 31 days back and 1-1000 events', () => {
    const iso = new Date(NOW - 3600_000).toISOString();
    expect(timelineSince(iso, '50', NOW)).toEqual({ ok: true, since: iso, limit: 50 });
    expect(timelineSince(new Date(NOW - 90 * 86_400_000).toISOString(), '5000', NOW)).toEqual({
      ok: true, since: new Date(NOW - 31 * 86_400_000).toISOString(), limit: 1000,
    });
    expect(timelineSince(new Date(NOW + 3600_000).toISOString(), null, NOW)).toMatchObject({ ok: true, since: new Date(NOW).toISOString() });
  });

  it('refuses a since that is not an ISO time and a limit that is not a positive whole number', () => {
    expect(timelineSince('yesterday', null, NOW)).toMatchObject({ ok: false });
    expect(timelineSince('1791900000', null, NOW)).toMatchObject({ ok: false });
    expect(timelineSince(null, '0', NOW)).toMatchObject({ ok: false });
    expect(timelineSince(null, '2.5', NOW)).toMatchObject({ ok: false });
    expect(timelineSince(null, 'lots', NOW)).toMatchObject({ ok: false });
  });
});
