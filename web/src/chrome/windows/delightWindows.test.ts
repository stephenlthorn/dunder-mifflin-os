import { describe, expect, it } from 'vitest';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { titleOf } from './titles';
import { INITIAL_WINDOWS, openWindow, windowId } from './windowState';

describe('the Dundies and Creed\'s corner windows', () => {
  it('there is one of each', () => {
    expect(windowId({ kind: 'dundies' })).toBe('dundies');
    expect(windowId({ kind: 'creed' })).toBe('creed');
    expect(openWindow(openWindow(INITIAL_WINDOWS, { kind: 'creed' }), { kind: 'creed' }).windows).toHaveLength(1);
  });

  it('are titled with the joke, or plainly in Toby mode', () => {
    const dundies = openWindow(INITIAL_WINDOWS, { kind: 'dundies' }).windows[0]!;
    const creed = openWindow(INITIAL_WINDOWS, { kind: 'creed' }).windows[0]!;
    expect(titleOf(dundies, DEMO_SNAPSHOT)).toBe('The Dundies');
    expect(titleOf(dundies, DEMO_SNAPSHOT, true)).toBe('Weekly review');
    expect(titleOf(creed, DEMO_SNAPSHOT)).toBe('Creed’s corner');
    expect(titleOf(creed, DEMO_SNAPSHOT, true)).toBe('Unattributed activity');
  });
});
