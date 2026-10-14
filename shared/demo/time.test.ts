import { describe, expect, it } from 'vitest';
import { DAY_END, DAY_START, DEFAULT_SPEED, hm, isoAt, parseClockTime, parseSeed, parseSpeed } from './time';
import { clockView, minuteAt, startClock, withSpeed, realMsAtMinute } from './clock';

describe('demo day time', () => {
  it('runs one office day, 08:30 to 17:30, in office time (UTC)', () => {
    expect(DAY_START).toBe(hm('08:30'));
    expect(DAY_END).toBe(hm('17:30'));
    expect(isoAt(hm('09:15'))).toBe('2005-03-24T09:15:00.000Z');
    expect(isoAt(hm('09:15'), 1)).toBe('2005-03-25T09:15:00.000Z');
  });

  it('validates speeds, start times and seeds from the outside world', () => {
    expect([1, 10, 60, '10', ' 60 '].map(parseSpeed)).toEqual([1, 10, 60, 10, 60]);
    expect([0, 5, 61, 'fast', null, undefined, 1.5].map(parseSpeed)).toEqual([null, null, null, null, null, null, null]);
    expect(parseClockTime('10:25')).toBe(hm('10:25'));
    expect(parseClockTime('9:05')).toBe(hm('09:05'));
    expect(['08:29', '17:30', '25:00', '10:60', '10', 'noon', 1025].map(parseClockTime)).toEqual([null, null, null, null, null, null, null]);
    expect(parseSeed('42')).toBe(42);
    expect(['-1', '1.5', 'x', '99999999999'].map(parseSeed)).toEqual([null, null, null, null]);
    expect(DEFAULT_SPEED).toBe(60);
  });
});

describe('demo clock', () => {
  const T0 = 1_000_000;

  it('advances office time at its speed and loops at the end of the day', () => {
    const clock = startClock(T0, hm('17:00'), 60);
    expect(minuteAt(clock, T0)).toBe(hm('17:00'));
    expect(minuteAt(clock, T0 + 10_000)).toBe(hm('17:10')); // 10 s at 60x = 10 minutes
    expect(minuteAt(clock, T0 + 30_000)).toBe(DAY_START); // 17:30 wraps to 08:30
    expect(clockView(clock, T0 + 31_000)).toMatchObject({ day: 1, speed: 60, time: '2005-03-24T08:31:00.000Z' });
  });

  it('changes speed without jumping in time', () => {
    const clock = startClock(T0, hm('10:00'), 60);
    const slow = withSpeed(clock, 1, T0 + 60_000); // 10:00 + 60 min at 60x
    expect(minuteAt(slow, T0 + 60_000)).toBe(hm('11:00'));
    expect(minuteAt(slow, T0 + 120_000)).toBe(hm('11:01'));
    expect(clockView(slow, T0 + 60_000).speed).toBe(1);
  });

  it('says when (real time) a later office minute arrives, even after a loop', () => {
    const clock = startClock(T0, hm('17:20'), 10);
    expect(realMsAtMinute(clock, T0, hm('17:25'))).toBe(T0 + 30_000); // 5 min at 10x
    expect(realMsAtMinute(clock, T0, hm('08:40'))).toBe(T0 + 120_000); // 10 min to the loop + 10 min
  });

  it('round-trips through the clock view a browser receives', () => {
    const clock = startClock(T0, hm('12:00'), 10);
    const view = clockView(clock, T0 + 5000);
    expect(view).toMatchObject({ speed: 10, speeds: [1, 10, 60], start: '08:30', end: '17:30', title: 'Threat Level Midnight' });
    const copy = startClock(0, DAY_START, view.speed);
    const rebuilt = { ...copy, anchorRealMs: 7000, anchorSimMs: view.offsetMs };
    expect(minuteAt(rebuilt, 7000)).toBeCloseTo(minuteAt(clock, T0 + 5000), 6);
  });
});
