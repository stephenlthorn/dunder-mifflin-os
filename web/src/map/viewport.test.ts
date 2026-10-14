import { describe, expect, it } from 'vitest';
import { MAX_SCALE, MIN_SCALE, centerOn, easeInOutCubic, fitView, interpolateView, panBy, toWorld, zoomAt } from './viewport';

describe('fitView', () => {
  it('scales the content to fit and centres it', () => {
    const v = fitView({ minX: -100, minY: -50, maxX: 100, maxY: 50 }, { w: 400, h: 400 }, 0);
    expect(v.scale).toBeCloseTo(2);
    expect(v.x).toBeCloseTo(200);
    expect(v.y).toBeCloseTo(200);
  });

  it('respects padding', () => {
    const v = fitView({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, { w: 120, h: 120 }, 10);
    expect(v.scale).toBeCloseTo(1);
  });
});

describe('zoomAt', () => {
  it('keeps the point under the cursor fixed', () => {
    const v = { scale: 1, x: 0, y: 0 };
    const before = toWorld(v, { x: 50, y: 80 });
    const z = zoomAt(v, 2, { x: 50, y: 80 });
    const after = toWorld(z, { x: 50, y: 80 });
    expect(z.scale).toBeCloseTo(2);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps the scale', () => {
    expect(zoomAt({ scale: 1, x: 0, y: 0 }, 1000, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
    expect(zoomAt({ scale: 1, x: 0, y: 0 }, 0.0001, { x: 0, y: 0 }).scale).toBe(MIN_SCALE);
  });
});

describe('panBy', () => {
  it('moves the view without touching the input', () => {
    const v = { scale: 1, x: 5, y: 5 };
    expect(panBy(v, 10, -5)).toEqual({ scale: 1, x: 15, y: 0 });
    expect(v).toEqual({ scale: 1, x: 5, y: 5 });
  });
});

describe('camera glide', () => {
  const size = { w: 800, h: 600 };

  it('eases in and out between 0 and 1', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });

  it('centres a world point on screen at a scale (clamped)', () => {
    const v = centerOn({ x: 100, y: 50 }, 2, size);
    expect(toWorld(v, { x: 400, y: 300 })).toEqual({ x: 100, y: 50 });
    expect(v.scale).toBe(2);
    expect(centerOn({ x: 0, y: 0 }, 99, size).scale).toBe(MAX_SCALE);
  });

  it('interpolates from one view to another, ending exactly on the target', () => {
    const a = centerOn({ x: 0, y: 0 }, 1, size);
    const b = centerOn({ x: 200, y: 100 }, 4, size);
    expect(interpolateView(a, b, 0, size)).toEqual(a);
    const end = interpolateView(a, b, 1, size);
    expect(end.scale).toBeCloseTo(b.scale);
    expect(end.x).toBeCloseTo(b.x);
    expect(end.y).toBeCloseTo(b.y);
    const mid = interpolateView(a, b, 0.5, size);
    expect(mid.scale).toBeCloseTo(2); // zoom is geometric, so it feels even
    const c = toWorld(mid, { x: 400, y: 300 });
    expect(c.x).toBeCloseTo(100);
    expect(c.y).toBeCloseTo(50);
  });
});
