import { describe, expect, it } from 'vitest';
import { STRAYS, straysAt } from './strays';
import { DAY_END, DAY_START, hm } from './time';

describe('the demo day\'s strays (Creed\'s corner)', () => {
  it('are a few open cards inside the office day', () => {
    expect(STRAYS.length).toBeGreaterThanOrEqual(2);
    for (const s of STRAYS) {
      expect(s.at).toBeGreaterThanOrEqual(DAY_START);
      expect(s.at).toBeLessThan(DAY_END);
      expect(s.status).not.toBe('done');
    }
    expect(new Set(STRAYS.map((s) => s.key)).size).toBe(STRAYS.length);
  });

  it('turn up at their minute and stay for the rest of the day', () => {
    const first = Math.min(...STRAYS.map((s) => s.at));
    expect(straysAt(first - 1)).toEqual([]);
    expect(straysAt(hm('17:00'))).toHaveLength(STRAYS.length);
  });
});
