// Desks: top slab, pedestal, modesty panel, legs, screen and keyboard; the clutter on top comes from deskItems.
import type { DeskItem, Facing, Furniture } from '@shared/office';
import { shade } from '../../iso/color';
import type { Box3 } from '../../iso/projection';
import { PAL } from '../palette';
import { type Frame, deskSlots, itemParts } from './deskItems';
import { type Decal, type Part, box, faceRect, facingFace } from './parts';

/** Desk-local frame: u along the desk's long edge (toward +x / +y), v from the far side (0) to the user's side (S). */
export function deskFrame(f: Furniture): Frame {
  const facing = f.facing ?? 's';
  const alongX = facing === 'n' || facing === 's';
  const L = alongX ? f.w : f.d;
  const S = alongX ? f.d : f.w;
  const toBox = (u0: number, u1: number, v0: number, v1: number, z: number, h: number): Box3 => {
    switch (facing) {
      case 's': return { x: f.x + u0, y: f.y + v0, z, w: u1 - u0, d: v1 - v0, h };
      case 'n': return { x: f.x + u0, y: f.y + f.d - v1, z, w: u1 - u0, d: v1 - v0, h };
      case 'w': return { x: f.x + v0, y: f.y + u0, z, w: v1 - v0, d: u1 - u0, h };
      default: return { x: f.x + f.w - v1, y: f.y + u0, z, w: v1 - v0, d: u1 - u0, h };
    }
  };
  return { L, S, toBox };
}

const TOWARD_USER: Record<Facing, Facing> = { n: 's', s: 'n', e: 'w', w: 'e' };

/** The screen face of a monitor-like box: it faces the user (PartView hides it when the camera is behind it). */
function screenDecal(facing: Facing, b: Box3, fill: string): Decal {
  const inset = 0.07;
  const face = facingFace(b, TOWARD_USER[facing]);
  return faceRect(face.plane, face.at, face.u0 + inset, face.u0 + face.len - inset, b.z + inset, b.z + b.h - inset, fill);
}

export function deskParts(f: Furniture): Part[] {
  const fr = deskFrame(f);
  const { L, S } = fr;
  const h = f.h ?? 1.5;
  const T = 0.12;
  const side = f.color ?? PAL.deskSide;
  const top = f.color ? shade(f.color, 0.25) : PAL.deskTop;
  const items = f.items ?? [];
  const parts: Part[] = [
    box(`${f.id}.top`, fr.toBox(0, L, 0, S, h - T, T), side, top),
    box(`${f.id}.pedestal`, fr.toBox(L - 0.95, L - 0.08, 0.08, S - 0.08, 0, h - T), shade(side, -0.04), top),
    box(`${f.id}.panel`, fr.toBox(0.08, L - 0.95, 0.06, 0.14, 0.35, h - T - 0.35), shade(side, -0.08)),
    box(`${f.id}.leg`, fr.toBox(0.08, 0.18, 0.14, S - 0.08, 0, h - T), shade(side, -0.12)),
  ];
  const screens = items.includes('monitor') || items.includes('laptop');
  if (items.includes('monitor')) {
    const mv0 = S < 1.3 ? 0.06 : 0.22;
    const panel = fr.toBox(L / 2 - 0.05, L / 2 + 1.05, mv0, mv0 + 0.16, h + 0.22, 0.78);
    const decal = screenDecal(f.facing ?? 's', panel, PAL.screen);
    parts.push(
      box(`${f.id}.stand`, fr.toBox(L / 2 + 0.42, L / 2 + 0.58, mv0 + 0.16, mv0 + 0.3, h, 0.24), '#3a3f47'),
      box(`${f.id}.monitor`, panel, PAL.monitor, '#3d424b', { decals: [decal] }),
    );
  }
  if (items.includes('laptop')) {
    const lid = fr.toBox(L / 2 - 0.45, L / 2 + 0.45, 0.2, 0.26, h + 0.04, 0.55);
    const decal = screenDecal(f.facing ?? 's', lid, '#b8e2f7');
    parts.push(
      box(`${f.id}.laptop-base`, fr.toBox(L / 2 - 0.45, L / 2 + 0.45, 0.26, 0.86, h, 0.04), '#9aa1aa', '#c9ced4'),
      box(`${f.id}.laptop-lid`, lid, '#7d848d', '#a9afb7', { decals: [decal] }),
    );
  }
  if (screens) parts.push(box(`${f.id}.keyboard`, fr.toBox(L / 2 - 0.7, L / 2 + 0.3, S - 0.5, S - 0.18, h, 0.04), '#c9ccd1', '#e8eaed'));
  const extras = items.filter((i): i is DeskItem => i !== 'monitor' && i !== 'laptop');
  const spots = deskSlots(L, S, items.includes('laptop'));
  extras.slice(0, spots.length).forEach((item, i) => {
    parts.push(...itemParts(`${f.id}.${i}`, item, fr, spots[i][0], spots[i][1], h));
  });
  return parts;
}
