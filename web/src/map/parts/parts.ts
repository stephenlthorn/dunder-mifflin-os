// A furniture item is drawn as a handful of primitive parts (boxes, cylinders, blobs) plus flat decals on their faces.
import type { Facing } from '@shared/office';
import type { Box3, Vec3 } from '../../iso/projection';

/** `text` runs along world axis `axis` on a vertical face, starting (or centred, anchor 'middle') at `at`; size in world units. */
export type TextDecal = {
  kind: 'text'; at: Vec3; axis: 'x' | 'y'; text: string; size: number; fill: string; weight?: number; anchor?: 'start' | 'middle';
};
export type Decal =
  | { kind: 'poly'; points: Vec3[]; fill: string; stroke?: string; opacity?: number }
  | { kind: 'lines'; segments: [Vec3, Vec3][]; stroke: string; width?: number; opacity?: number }
  | TextDecal;

/** `className`: a hook for CSS (the bobblehead's nodding head, the boss mug), set on the part's group. */
type Base = { id: string; decals?: Decal[]; opacity?: number; className?: string };
/** `clipDecals: 'top'` shows the decals only through the box's top face (stair treads seen through a well's opening). */
export type BoxPart = Base & { shape: 'box'; box: Box3; side: string; top?: string; stroke?: string; clipDecals?: 'top' };
export type CylPart = Base & { shape: 'cyl'; cx: number; cy: number; z: number; r: number; h: number; side: string; top?: string };
export type BlobPart = Base & { shape: 'blob'; cx: number; cy: number; z: number; r: number; fill: string };
/** A ring sector (curved desk): radii r0 < r1 around (cx, cy), swept from a0 to a1 degrees (0 = +x, 90 = +y). */
export type ArcPart = Base & { shape: 'arc'; cx: number; cy: number; z: number; r0: number; r1: number; a0: number; a1: number; h: number; side: string; top?: string };
export type Part = BoxPart | CylPart | BlobPart | ArcPart;

export const box = (id: string, b: Box3, side: string, top?: string, extra: Partial<BoxPart> = {}): BoxPart => ({
  id, shape: 'box', box: b, side, top, ...extra,
});

export const cyl = (id: string, cx: number, cy: number, z: number, r: number, h: number, side: string, top?: string): CylPart => ({
  id, shape: 'cyl', cx, cy, z, r, h, side, top,
});

export const blob = (id: string, cx: number, cy: number, z: number, r: number, fill: string): BlobPart => ({
  id, shape: 'blob', cx, cy, z, r, fill,
});

export const arc = (id: string, cx: number, cy: number, z: number, r0: number, r1: number, a0: number, a1: number, h: number, side: string, top?: string): ArcPart => ({
  id, shape: 'arc', cx, cy, z, r0, r1, a0, a1, h, side, top,
});

const RAD = Math.PI / 180;

/** Plan points along an arc's inner and outer edges, sampled every ≤ 10° (plus its ends). */
export function arcPoints(p: ArcPart, r: number): { x: number; y: number }[] {
  const steps = Math.max(2, Math.ceil(Math.abs(p.a1 - p.a0) / 10));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (p.a0 + ((p.a1 - p.a0) * i) / steps) * RAD;
    return { x: p.cx + r * Math.cos(a), y: p.cy + r * Math.sin(a) };
  });
}

function arcBox(p: ArcPart): Box3 {
  const cardinal = [0, 90, 180, 270, 360, 450].filter((a) => a > Math.min(p.a0, p.a1) && a < Math.max(p.a0, p.a1));
  const pts = [...arcPoints(p, p.r0), ...arcPoints(p, p.r1), ...cardinal.flatMap((a) => [p.r0, p.r1].map((r) => ({
    x: p.cx + r * Math.cos(a * RAD), y: p.cy + r * Math.sin(a * RAD),
  })))];
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, z: p.z, w: Math.max(...xs) - x, d: Math.max(...ys) - y, h: p.h };
}

export function partBox(p: Part): Box3 {
  switch (p.shape) {
    case 'box':
      return p.box;
    case 'arc':
      return arcBox(p);
    case 'cyl':
      return { x: p.cx - p.r, y: p.cy - p.r, z: p.z, w: p.r * 2, d: p.r * 2, h: p.h };
    default:
      return { x: p.cx - p.r, y: p.cy - p.r, z: p.z - p.r, w: p.r * 2, d: p.r * 2, h: p.r * 2 };
  }
}

/** A flat rectangle decal lying on a horizontal plane at height z. */
export const flatRect = (x: number, y: number, w: number, d: number, z: number, fill: string, opacity?: number): Decal => ({
  kind: 'poly', fill, opacity,
  points: [{ x, y, z }, { x: x + w, y, z }, { x: x + w, y: y + d, z }, { x, y: y + d, z }],
});

/** A rectangle decal on a vertical face: plane x = at (axis 'x') or y = at (axis 'y'). u runs along the face, z up. */
export function faceRect(axis: 'x' | 'y', at: number, u0: number, u1: number, z0: number, z1: number, fill: string, opacity?: number): Decal {
  const pt = (u: number, z: number): Vec3 => (axis === 'x' ? { x: at, y: u, z } : { x: u, y: at, z });
  return { kind: 'poly', fill, opacity, points: [pt(u0, z0), pt(u1, z0), pt(u1, z1), pt(u0, z1)] };
}

/** The vertical face something facing `facing` shows: faceRect's plane axis, the plane, and the span along it. */
export function facingFace(f: { x: number; y: number; w: number; d: number }, facing: Facing): { plane: 'x' | 'y'; at: number; u0: number; len: number } {
  switch (facing) {
    case 's': return { plane: 'y', at: f.y, u0: f.x, len: f.w };
    case 'n': return { plane: 'y', at: f.y + f.d, u0: f.x, len: f.w };
    case 'e': return { plane: 'x', at: f.x + f.w, u0: f.y, len: f.d };
    default: return { plane: 'x', at: f.x, u0: f.y, len: f.d };
  }
}
