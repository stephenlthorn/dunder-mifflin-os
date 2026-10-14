import { describe, expect, it } from 'vitest';
import type { OfficeSnapshot } from '@shared/contract';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { clockFromView, formatOfficeTime, isDemoDay, officeNowMs, parseClockView } from './demoClock';

const VIEW = {
  title: 'Threat Level Midnight', speed: 60, speeds: [1, 10, 60], time: '2005-03-24T10:00:00.000Z',
  offsetMs: 90 * 60_000, day: 0, start: '08:30', end: '17:30',
};

describe('demo clock in the browser', () => {
  it('accepts a well-formed clock from the server and nothing else', () => {
    expect(parseClockView(VIEW)).toEqual(VIEW);
    expect(parseClockView({ ...VIEW, speed: 5 })).toBeNull();
    expect(parseClockView({ ...VIEW, offsetMs: -1 })).toBeNull();
    expect(parseClockView({ ...VIEW, title: 42 })).toBeNull();
    expect(parseClockView(null)).toBeNull();
    expect(parseClockView({ ...VIEW, speeds: [1, 'x'] })).toBeNull();
  });

  it('keeps time locally between syncs, at the demo speed', () => {
    const clock = clockFromView(parseClockView(VIEW)!, 1000);
    expect(new Date(officeNowMs(clock, 1000)).toISOString()).toBe('2005-03-24T10:00:00.000Z');
    expect(new Date(officeNowMs(clock, 61_000)).toISOString()).toBe('2005-03-24T11:00:00.000Z');
  });

  it('shows office time the same in every time zone', () => {
    expect(formatOfficeTime(Date.parse('2005-03-24T14:05:00.000Z'))).toBe('2:05 PM');
    expect(formatOfficeTime(Date.parse('2005-03-24T09:30:59.000Z'))).toBe('9:30 AM');
  });

  it('knows a demo day from its adapter', () => {
    const demo: OfficeSnapshot = { ...DEMO_SNAPSHOT, adapters: [{ id: 'demo', kind: 'demo', label: 'Demo', agents: 13, capabilities: { chat: true, createTask: true, approvals: false, pause: false, stop: false } }] };
    expect(isDemoDay(demo)).toBe(true);
    expect(isDemoDay(DEMO_SNAPSHOT)).toBe(false);
    expect(isDemoDay(null)).toBe(false);
  });
});
