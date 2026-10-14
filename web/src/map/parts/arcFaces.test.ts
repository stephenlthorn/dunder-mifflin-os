import { describe, expect, it } from 'vitest';
import { viewDepth } from '../../iso/projection';
import { arcFaces } from './arcFaces';
import { arc } from './parts';

const centroid = (pts: { x: number; y: number; z?: number }[]) => viewDepth({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  z: pts.reduce((s, p) => s + (p.z ?? 0), 0) / pts.length,
});

describe('arcFaces', () => {
  const desk = arc('d', 10, 10, 0, 1.3, 2.6, 105, 255, 1.45, '#b98a5a', '#d1a575');
  const faces = arcFaces(desk);

  it('ends with the top face at the arc height', () => {
    const top = faces[faces.length - 1];
    expect(top.face).toBe('top');
    expect(top.points.every((p) => p.z === 1.45)).toBe(true);
  });

  it('keeps only side faces that point at the camera, painted far to near', () => {
    const sides = faces.filter((f) => f.face !== 'top');
    expect(sides.length).toBeGreaterThan(3);
    const depths = sides.map((f) => centroid(f.points));
    expect([...depths].sort((a, b) => b - a)).toEqual(depths);
    // the convex west side faces the camera; the far ends of the inner (concave) side face away
    expect(sides.some((f) => f.face === 'outer')).toBe(true);
  });

  it('follows the eye: from the east it sees the concave inner side of a desk that bulges west', () => {
    const fromEast = arcFaces(desk, { x: 30, y: -30, z: 40 }).filter((f) => f.face !== 'top');
    const fromWest = arcFaces(desk, { x: -30, y: -30, z: 40 }).filter((f) => f.face !== 'top');
    const westish = (fs: typeof faces, face: string) => fs.filter((f) => f.face === face && f.points[0].x < 9).length;
    expect(westish(fromEast, 'outer')).toBeLessThan(westish(fromWest, 'outer'));
    expect(fromEast.some((f) => f.face === 'inner')).toBe(true);
  });

  it('shades a face by how far it turns from the camera-left plane to the camera-right plane', () => {
    for (const f of faces.filter((x) => x.face !== 'top')) {
      expect(f.tone).toBeGreaterThanOrEqual(0);
      expect(f.tone).toBeLessThanOrEqual(1);
    }
  });
});
