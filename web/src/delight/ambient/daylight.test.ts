import { describe, expect, it } from 'vitest';
import { daylightAt } from './daylight';

describe('daylightAt', () => {
  it('follows the clock: night, dawn, day, dusk', () => {
    expect(daylightAt(3)).toBe('night');
    expect(daylightAt(6.5)).toBe('dawn');
    expect(daylightAt(8)).toBe('day');
    expect(daylightAt(15)).toBe('day');
    expect(daylightAt(17.25)).toBe('dusk'); // the demo day's last half hour
    expect(daylightAt(20)).toBe('night');
    expect(daylightAt(18.2)).toBe('dusk');
    expect(daylightAt(21)).toBe('night');
    expect(daylightAt(23.99)).toBe('night');
  });
});
