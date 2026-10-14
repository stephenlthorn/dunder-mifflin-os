// The stairwell: red-carpet stairs in a well, the white half-wall with its wooden handrail, and framed pictures.
import type { Furniture } from '@shared/office';
import { shade } from '../../iso/color';
import type { Box3, Vec3 } from '../../iso/projection';
import { type Decal, type Part, box, faceRect, facingFace, flatRect } from './parts';

const STEPS = 8;
const RISE = 0.3;

/**
 * Stairs. Facing 'n' they rise toward +y like the render's red-carpet flight: STEPS solid steps, each riser facing the
 * camera, onto a landing at the back as high as the item (h, default 2.4). Other facings go down a well toward −y, the
 * treads showing only through its opening, with railings on the long sides.
 */
export function stairsParts(f: Furniture): Part[] {
  return f.facing === 'n' ? risingParts(f) : wellParts(f);
}

function risingParts(f: Furniture): Part[] {
  const top = f.h ?? 2.4;
  const landing = Math.min(3.2, f.d * 0.38);
  const stepD = (f.d - landing) / STEPS;
  const carpet = f.color ?? '#9a948a';
  const steps = Array.from({ length: STEPS }, (_, i) => box(
    `${f.id}.step${i}`,
    { x: f.x, y: f.y + i * stepD, z: 0, w: f.w, d: stepD, h: (top * (i + 1)) / (STEPS + 1) },
    shade(carpet, 0.1), i % 2 ? shade(carpet, -0.08) : carpet,
  ));
  return [
    ...steps,
    box(`${f.id}.landing`, { x: f.x, y: f.y + f.d - landing, z: 0, w: f.w, d: landing, h: top }, '#ece6da', carpet),
  ];
}

function wellParts(f: Furniture): Part[] {
  const stepD = f.d / STEPS;
  const [even, odd] = f.color ? [f.color, shade(f.color, -0.14)] : ['#bdb5a8', '#c9c2b6'];
  const treads = Array.from({ length: STEPS }, (_, i): Decal => flatRect(f.x + 0.2, f.y + i * stepD, f.w - 0.4, stepD, -((STEPS - i) * RISE), i % 2 ? odd : even));
  const rail = (id: string, x: number): Part => box(`${f.id}.${id}`, { x, y: f.y, z: 0, w: 0.1, d: f.d, h: 1 }, '#8a9097', '#b5bbc2', { opacity: 0.9 });
  return [
    box(`${f.id}.well`, { x: f.x, y: f.y, z: 0, w: f.w, d: f.d, h: 0.02 }, '#6f685e', '#5a544b', { decals: treads, clipDecals: 'top' }),
    rail('rail1', f.x), rail('rail2', f.x + f.w - 0.1),
  ];
}

/** A white half-wall with a red cap and a wooden handrail on the face toward the camera. */
export function balustradeParts(f: Furniture): Part[] {
  const h = f.h ?? 1.3;
  const alongY = f.d >= f.w;
  const railT = 0.08;
  const body: Box3 = alongY
    ? { x: f.x + railT + 0.02, y: f.y, z: 0, w: f.w - railT - 0.02, d: f.d, h: h - 0.1 }
    : { x: f.x, y: f.y + railT + 0.02, z: 0, w: f.w, d: f.d - railT - 0.02, h: h - 0.1 };
  const rail: Box3 = alongY
    ? { x: f.x, y: f.y + 0.15, z: h * 0.68, w: railT, d: f.d - 0.3, h: railT }
    : { x: f.x + 0.15, y: f.y, z: h * 0.68, w: f.w - 0.3, d: railT, h: railT };
  return [
    box(`${f.id}.wall`, body, '#f1ede4', '#f7f4ed'),
    box(`${f.id}.cap`, { ...body, z: h - 0.1, h: 0.1 }, '#8a3a40', '#a24a50'),
    box(`${f.id}.rail`, rail, '#a77c55', '#c69c6a'),
  ];
}

/** A framed picture on a wall: dark frame, white mat and a simple landscape, on the face it faces. */
export function pictureParts(f: Furniture): Part[] {
  const z = f.z ?? 1.3;
  const h = f.h ?? 0.9;
  const { plane, at, u0, len } = facingFace(f, f.facing ?? 'w');
  const u1 = u0 + len;
  const art = f.color ?? '#5d7f9e';
  const pt = (u: number, zz: number): Vec3 => (plane === 'x' ? { x: at, y: u, z: zz } : { x: u, y: at, z: zz });
  const hills: Decal = {
    kind: 'poly', fill: shade(art, -0.25),
    points: [pt(u0 + 0.2, z + 0.2), pt(u0 + 0.45, z + h * 0.55), pt(u0 + len * 0.6, z + 0.35), pt(u1 - 0.2, z + h * 0.6), pt(u1 - 0.2, z + 0.2)],
  };
  return [box(`${f.id}.frame`, { x: f.x, y: f.y, z, w: f.w, d: f.d, h }, '#2d3035', '#3a3d42', {
    decals: [
      faceRect(plane, at, u0 + 0.06, u1 - 0.06, z + 0.06, z + h - 0.06, '#f4f2ee'),
      faceRect(plane, at, u0 + 0.2, u1 - 0.2, z + 0.2, z + h - 0.2, shade(art, 0.35)),
      hills,
    ],
  })];
}
