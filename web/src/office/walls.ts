// Turn wall lines (with door/window openings) into cut-away boxes. x-walls own the corners; y-walls are trimmed.
import type { Opening, Wall } from '@shared/office';
import type { Box3 } from '../iso/projection';

export type WallPieceKind = 'solid' | 'sill' | 'glass' | 'blinds' | 'door';
/** `color`: the wall's tint (solid pieces and sills) or a door leaf's colour. */
export type WallPiece = { id: string; wallId: string; kind: WallPieceKind; exterior: boolean; axis: 'x' | 'y'; box: Box3; color?: string };

export const SILL_HEIGHT = 0.9;
const EPS = 0.01;
const half = (w: Wall) => (w.exterior ? 0.2 : 0.15);
const near = (a: number, b: number) => Math.abs(a - b) < EPS;
const covers = (w: Wall, v: number) => v >= w.from - EPS && v <= w.to + EPS;
const passesThrough = (w: Wall, v: number) => v > w.from + EPS && v < w.to - EPS;

/** Adjusted [from, to] along the wall's own axis after resolving corners and T-junctions. */
function extent(wall: Wall, walls: readonly Wall[]): [number, number] {
  const others = walls.filter((o) => o.axis !== wall.axis);
  const adjust = (end: number, dir: -1 | 1) => {
    const hit = others.find((o) => near(o.at, end) && covers(o, wall.at));
    if (!hit) return end;
    if (wall.axis === 'y') return end - dir * half(hit); // y-walls stop at the x-wall's face
    return passesThrough(hit, wall.at) ? end - dir * half(hit) : end + dir * half(hit);
  };
  return [adjust(wall.from, -1), adjust(wall.to, 1)];
}

type Span = { from: number; to: number; kind: Opening['kind'] | 'solid'; color?: string };

function spans(from: number, to: number, openings: readonly Opening[]): Span[] {
  const sorted = [...openings].sort((a, b) => a.from - b.from);
  const out: Span[] = [];
  let cursor = from;
  for (const o of sorted) {
    const a = Math.max(o.from, from);
    const b = Math.min(o.to, to);
    if (b <= a) continue;
    if (a > cursor + EPS) out.push({ from: cursor, to: a, kind: 'solid' });
    out.push({ from: a, to: b, kind: o.kind, color: o.color });
    cursor = b;
  }
  if (to > cursor + EPS) out.push({ from: cursor, to, kind: 'solid' });
  return out;
}

function box(wall: Wall, from: number, to: number, z: number, h: number): Box3 {
  const t = half(wall);
  const len = Number((to - from).toFixed(4));
  return wall.axis === 'x'
    ? { x: from, y: wall.at - t, z, w: len, d: t * 2, h }
    : { x: wall.at - t, y: from, z, w: t * 2, d: len, h };
}

export function wallPieces(walls: readonly Wall[], height: number): WallPiece[] {
  return walls.flatMap((wall) => {
    const [from, to] = extent(wall, walls);
    const top = wall.height ?? height;
    const make = (i: number, kind: WallPieceKind, a: number, b: number, z: number, h: number, color?: string): WallPiece => ({
      id: `${wall.id}#${i}${(kind === 'glass' || kind === 'blinds') && z > 0 ? 'g' : ''}`,
      wallId: wall.id,
      kind,
      exterior: Boolean(wall.exterior),
      axis: wall.axis,
      box: box(wall, a, b, z, h),
      ...(color ? { color } : {}),
    });
    const sill = (i: number, s: Span) => make(i, 'sill', s.from, s.to, 0, SILL_HEIGHT, wall.color);
    return spans(from, to, wall.openings ?? []).flatMap((s, i): WallPiece[] => {
      switch (s.kind) {
        case 'door':
          return [];
        case 'wood-door':
          return [make(i, 'door', s.from, s.to, 0, top, s.color)];
        case 'window':
          return [sill(i, s), make(i, 'glass', s.from, s.to, SILL_HEIGHT, top - SILL_HEIGHT)];
        case 'window-blinds':
          return [sill(i, s), make(i, 'blinds', s.from, s.to, SILL_HEIGHT, top - SILL_HEIGHT)];
        case 'glass':
        case 'blinds':
          return [make(i, s.kind, s.from, s.to, 0, top)];
        default:
          return [make(i, 'solid', s.from, s.to, 0, top, wall.color)];
      }
    });
  });
}
