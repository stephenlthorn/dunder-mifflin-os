import { describe, expect, it } from 'vitest';
import type { Area } from '@shared/office';
import { checkerPath, floorStyle, seamPath } from './floorPattern';

const area = (floor: Area['floor']): Area => ({ id: 'a', name: 'A', rect: { x: 0, y: 0, w: 4, h: 4 }, floor, level: 'main', sign: { x: 2, y: 2 } });

describe('floor patterns', () => {
  it('draws carpet tile seams on a grid inside the area', () => {
    const d = seamPath(area('carpet').rect, 2, 2);
    expect(d.match(/M/g)).toHaveLength(2); // one interior line each way
  });

  it('draws one path of alternate checker tiles for lino', () => {
    const d = checkerPath(area('lino').rect, 1);
    expect(d.match(/Z/g)).toHaveLength(8); // half of 16 tiles
  });

  it('has a style for every floor kind', () => {
    for (const k of ['carpet', 'carpet-blue', 'lino', 'wood', 'tile', 'concrete', 'slate'] as const) {
      expect(floorStyle(k).base).toMatch(/^#/);
    }
  });

  it('gives the break room slate its own dark finish', () => {
    expect(floorStyle('slate').base).not.toBe(floorStyle('concrete').base);
    expect(floorStyle('slate').seam).toMatch(/^#/);
  });
});
