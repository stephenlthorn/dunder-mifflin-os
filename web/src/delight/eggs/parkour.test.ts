import { describe, expect, it } from 'vitest';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { PARKOUR_PX_PER_MS, panSpeed, parkourLine, trackPan } from './parkour';

describe('parkour (a fast drag-pan)', () => {
  it('measures the speed over the last 150 ms', () => {
    const samples = [{ t: 0, x: 0, y: 0 }, { t: 100, x: 300, y: 400 }];
    expect(panSpeed(samples)).toBeCloseTo(5);
    expect(panSpeed([{ t: 0, x: 0, y: 0 }])).toBe(0);
    const old = [{ t: 0, x: 0, y: 0 }, { t: 1000, x: 3000, y: 0 }, { t: 1100, x: 3010, y: 0 }];
    expect(panSpeed(old)).toBeCloseTo(0.1);
  });

  it('keeps a short window of samples, newest last', () => {
    const kept = [0, 50, 100, 150, 400].reduce((acc, t) => trackPan(acc, { t, x: t, y: 0 }), [] as { t: number; x: number; y: number }[]);
    expect(kept.map((s) => s.t)).toEqual([400]);
    expect(PARKOUR_PX_PER_MS).toBeGreaterThan(2);
  });
});

describe('parkourLine', () => {
  it('reports the fleet you just flew over', () => {
    expect(parkourLine(DEMO_SNAPSHOT)).toEqual({ text: 'Parkour!', sub: 'Hardcore parkour over 5 working, 2 in a meeting, 1 with an error and 3 idle.' });
  });
});
