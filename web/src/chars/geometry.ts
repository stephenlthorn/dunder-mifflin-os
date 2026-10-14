// Shared geometry for the chibi figure. Units are screen px at map scale 1; y grows downward.
// The origin is the chair seat surface under the figure's hips.
import type { Look } from '@shared/contract';

export const HEAD_R = 9;
export const FRONT_HEAD = { x: 1, y: -22 };
export const BACK_HEAD = { x: -1, y: -22 };
export const SEAT_LIFT = -15; // seat surface above the floor point (z ≈ 0.92)

export function torsoHalfWidth(build: Look['build']): number {
  if (build === 'slim') return 5.4;
  if (build === 'large') return 8.4;
  return 6.4;
}

export function torsoPath(w: number): string {
  return [
    `M${-w} 0L${w} 0`,
    `C${w + 0.6} -6 ${w + 1.6} -11 ${w} -13`,
    `C${w - 2} -14.6 ${-(w - 2)} -14.6 ${-w} -13`,
    `C${-(w + 1.6)} -11 ${-(w + 0.6)} -6 ${-w} 0Z`,
  ].join('');
}

/** Path helper: shift a list of [dx, dy] around a centre into an SVG path ("M … C … Z" written with relative tokens). */
export function at(cx: number, cy: number, d: string): string {
  // tokens like "x+3.2" / "y-4" become absolute numbers
  return d.replace(/([xy])([+-]\d+(?:\.\d+)?)?/g, (_, axis: string, off?: string) => {
    const base = axis === 'x' ? cx : cy;
    return String(Number((base + (off ? Number(off) : 0)).toFixed(2)));
  });
}

export const TROUSERS = '#3d4250';
export const INK = '#2a211b';
