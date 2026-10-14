import { describe, expect, it } from 'vitest';
import type { Wall } from '@shared/office';
import { wallPieces } from './walls';

const H = 2.5;
const front: Wall = { id: 'front', axis: 'x', at: 0, from: 0, to: 10, exterior: true };
const left: Wall = { id: 'left', axis: 'y', at: 0, from: 0, to: 10, exterior: true };
const inner: Wall = { id: 'inner', axis: 'y', at: 5, from: 0, to: 10 };
const middle: Wall = { id: 'middle', axis: 'x', at: 5, from: 0, to: 10, openings: [{ from: 6, to: 8, kind: 'door' }] };

describe('wallPieces', () => {
  it('extends an x-wall over a corner where a y-wall ends, and trims the y-wall', () => {
    const pieces = wallPieces([front, left], H);
    const f = pieces.find((p) => p.wallId === 'front')!;
    const l = pieces.find((p) => p.wallId === 'left')!;
    expect(f.box.x).toBeCloseTo(-0.2);
    expect(f.box.y).toBeCloseTo(-0.2);
    expect(f.box.d).toBeCloseTo(0.4);
    expect(l.box.y).toBeCloseTo(0.2);
  });

  it('trims an x-wall at a T-junction with a y-wall running through', () => {
    const pieces = wallPieces([left, middle], H);
    const first = pieces.find((p) => p.wallId === 'middle')!;
    expect(first.box.x).toBeCloseTo(0.2);
  });

  it('trims a y-wall that ends on an x-wall by that wall’s half thickness', () => {
    const pieces = wallPieces([front, inner], H);
    const i = pieces.find((p) => p.wallId === 'inner')!;
    expect(i.box.y).toBeCloseTo(0.2);
    expect(i.box.x).toBeCloseTo(4.85);
    expect(i.box.w).toBeCloseTo(0.3);
  });

  it('leaves door gaps open', () => {
    const pieces = wallPieces([middle], H).filter((p) => p.wallId === 'middle');
    expect(pieces.map((p) => [p.box.x, p.box.x + p.box.w])).toEqual([[0, 6], [8, 10]]);
    expect(pieces.every((p) => p.kind === 'solid' && p.box.h === H)).toBe(true);
  });

  it('builds a window as a low sill plus glass up to the cut height', () => {
    const w: Wall = { id: 'w', axis: 'x', at: 0, from: 0, to: 6, openings: [{ from: 2, to: 4, kind: 'window' }] };
    const kinds = wallPieces([w], H).map((p) => `${p.kind}:${p.box.x}-${p.box.x + p.box.w}:${p.box.z}`);
    expect(kinds).toEqual(['solid:0-2:0', 'sill:2-4:0', 'glass:2-4:0.9', 'solid:4-6:0']);
  });

  it('marks full-height glazing and blinds', () => {
    const w: Wall = { id: 'w', axis: 'x', at: 0, from: 0, to: 6, openings: [{ from: 0, to: 3, kind: 'glass' }, { from: 3, to: 6, kind: 'blinds' }] };
    expect(wallPieces([w], H).map((p) => p.kind)).toEqual(['glass', 'blinds']);
  });

  it('gives every piece a unique id', () => {
    const ids = wallPieces([front, left, inner, middle], H).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draws a closed wood door as a full-height door panel in its own colour', () => {
    const w: Wall = { id: 'w', axis: 'x', at: 0, from: 0, to: 6, openings: [
      { from: 1, to: 2.5, kind: 'wood-door' }, { from: 4, to: 5.5, kind: 'wood-door', color: '#2f6f8f' },
    ] };
    const doors = wallPieces([w], H).filter((p) => p.kind === 'door');
    expect(doors.map((p) => [p.box.x, p.box.x + p.box.w, p.box.z, p.box.h])).toEqual([[1, 2.5, 0, H], [4, 5.5, 0, H]]);
    expect(doors[0].color).toBeUndefined();
    expect(doors[1].color).toBe('#2f6f8f');
  });

  it('builds a blinds window as a sill plus blinds above it', () => {
    const w: Wall = { id: 'w', axis: 'y', at: 0, from: 0, to: 4, openings: [{ from: 1, to: 3, kind: 'window-blinds' }] };
    expect(wallPieces([w], H).map((p) => `${p.kind}:${p.box.z}`)).toEqual(['solid:0', 'sill:0', `blinds:0.9`, 'solid:0']);
  });

  it('carries a wall tint to its solid pieces and sills', () => {
    const w: Wall = { id: 'w', axis: 'x', at: 0, from: 0, to: 6, color: '#efc6cf', openings: [{ from: 2, to: 4, kind: 'window' }] };
    const pieces = wallPieces([w], H);
    expect(pieces.filter((p) => p.kind === 'solid' || p.kind === 'sill').every((p) => p.color === '#efc6cf')).toBe(true);
    expect(pieces.find((p) => p.kind === 'glass')!.color).toBeUndefined();
  });

  it('raises a full-height wall (and its windows and doors) to its own height', () => {
    const w: Wall = { id: 'w', axis: 'x', at: 0, from: 0, to: 9, height: 4.2, openings: [
      { from: 2, to: 4, kind: 'window-blinds' }, { from: 6, to: 7.5, kind: 'wood-door' },
    ] };
    const tops = wallPieces([w], H).map((p) => `${p.kind}:${Number((p.box.z + p.box.h).toFixed(2))}`);
    expect(tops).toEqual(['solid:4.2', 'sill:0.9', 'blinds:4.2', 'solid:4.2', 'door:4.2', 'solid:4.2']);
  });
});
