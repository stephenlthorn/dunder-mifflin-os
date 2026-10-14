import { describe, expect, it } from 'vitest';
import { CHIME_GAIN, CHIME_NOTES, playChime } from './chime';

describe('chime', () => {
  it('is subtle: quiet and under a second', () => {
    expect(CHIME_GAIN).toBeLessThanOrEqual(0.1);
    expect(Math.max(...CHIME_NOTES.map((n) => n.at + n.dur))).toBeLessThan(1);
  });

  it('reports false instead of throwing where there is no Web Audio', () => {
    expect(playChime()).toBe(false);
  });
});
