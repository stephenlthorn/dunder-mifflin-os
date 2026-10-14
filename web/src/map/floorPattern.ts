// Floor finishes per area kind: base colour plus seams (carpet tiles, planks, tiles, slabs) or a checkerboard (lino).
import type { FloorKind, Rect } from '@shared/office';
import { project, toPath } from '../iso/projection';
import { PAL } from './palette';

export type FloorStyle = { base: string; seam?: string; tileW: number; tileD: number; checker?: string; planks?: boolean };

export function floorStyle(kind: FloorKind): FloorStyle {
  switch (kind) {
    case 'carpet': return { base: PAL.carpet, seam: PAL.carpetSeam, tileW: 2, tileD: 2 };
    case 'carpet-blue': return { base: PAL.carpetBlue, seam: PAL.carpetBlueSeam, tileW: 2, tileD: 2 };
    case 'wood': return { base: PAL.wood, seam: PAL.woodSeam, tileW: 3, tileD: 0.5, planks: true };
    case 'lino': return { base: PAL.lino, checker: PAL.linoAlt, tileW: 1, tileD: 1 };
    case 'tile': return { base: PAL.tile, seam: PAL.tileSeam, tileW: 1.5, tileD: 1.5 };
    case 'slate': return { base: PAL.slate, seam: PAL.slateSeam, tileW: 2, tileD: 2 };
    default: return { base: PAL.concrete, seam: PAL.concreteSeam, tileW: 4, tileD: 4 };
  }
}

const line = (x0: number, y0: number, x1: number, y1: number) => toPath([project({ x: x0, y: y0 }), project({ x: x1, y: y1 })], false);

/** Interior grid lines every tw along x and td along y. */
export function seamPath(r: Rect, tw: number, td: number): string {
  const parts: string[] = [];
  for (let x = r.x + tw; x < r.x + r.w - 1e-6; x += tw) parts.push(line(x, r.y, x, r.y + r.h));
  for (let y = r.y + td; y < r.y + r.h - 1e-6; y += td) parts.push(line(r.x, y, r.x + r.w, y));
  return parts.join('');
}

/** Wood planks: rows along x every `td`, with staggered end joints every `tw`. */
export function plankPath(r: Rect, tw: number, td: number): string {
  const parts: string[] = [];
  let row = 0;
  for (let y = r.y; y < r.y + r.h - 1e-6; y += td, row += 1) {
    if (y > r.y) parts.push(line(r.x, y, r.x + r.w, y));
    const offset = ((row * 7) % 5) * (tw / 5);
    for (let x = r.x + offset + tw; x < r.x + r.w - 1e-6; x += tw) parts.push(line(x, y, x, Math.min(y + td, r.y + r.h)));
  }
  return parts.join('');
}

export function checkerPath(r: Rect, size: number): string {
  const parts: string[] = [];
  for (let i = 0; i * size < r.w - 1e-6; i += 1) {
    for (let j = 0; j * size < r.h - 1e-6; j += 1) {
      if ((i + j) % 2 === 1) continue;
      const x = r.x + i * size;
      const y = r.y + j * size;
      const w = Math.min(size, r.x + r.w - x);
      const d = Math.min(size, r.y + r.h - y);
      parts.push(toPath([project({ x, y }), project({ x: x + w, y }), project({ x: x + w, y: y + d }), project({ x, y: y + d })]));
    }
  }
  return parts.join('');
}
