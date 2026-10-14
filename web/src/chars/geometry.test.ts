import { describe, expect, it } from 'vitest';
import { at, torsoHalfWidth, torsoPath } from './geometry';

describe('character geometry', () => {
  it('widens the torso with build', () => {
    expect(torsoHalfWidth('slim')).toBeLessThan(torsoHalfWidth(undefined));
    expect(torsoHalfWidth('large')).toBeGreaterThan(torsoHalfWidth('average'));
  });

  it('builds a closed torso path', () => {
    expect(torsoPath(6)).toMatch(/^M-6 0L6 0C.*Z$/);
  });

  it('expands x/y offset tokens around a centre', () => {
    expect(at(1, -22, 'Mx-9,y+1 Lx,y')).toBe('M-8,-21 L1,-22');
  });
});
