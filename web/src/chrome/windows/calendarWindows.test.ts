import { describe, expect, it } from 'vitest';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { titleOf } from './titles';
import { INITIAL_WINDOWS, MINUTES_TAB, openWindow, setAreaRoom, windowId } from './windowState';

describe('the calendar window and the Minutes tab', () => {
  it('there is one calendar window: opening it again focuses it', () => {
    const once = openWindow(INITIAL_WINDOWS, { kind: 'calendar' });
    const twice = openWindow(once, { kind: 'calendar' });
    expect(windowId({ kind: 'calendar' })).toBe('calendar');
    expect(twice.windows).toHaveLength(1);
    expect(twice.windows[0]?.z).toBeGreaterThan(once.windows[0]?.z ?? 0);
  });

  it('titles: the committee, and the Conference Room’s minutes', () => {
    const cal = openWindow(INITIAL_WINDOWS, { kind: 'calendar' }).windows[0]!;
    expect(titleOf(cal, DEMO_SNAPSHOT)).toBe('Party Planning Committee');
    const conf = openWindow(INITIAL_WINDOWS, { kind: 'area', areaId: 'conference' });
    expect(titleOf(conf.windows[0]!, DEMO_SNAPSHOT)).toBe('Conference Room — Ops room');
    const minutes = setAreaRoom(conf, 'area:conference', MINUTES_TAB);
    expect(titleOf(minutes.windows[0]!, DEMO_SNAPSHOT)).toBe('Conference Room — Minutes');
  });
});
