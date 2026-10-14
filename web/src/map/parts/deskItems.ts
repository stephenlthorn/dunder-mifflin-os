// The things people keep on their desks, and where they go: up to six half-unit spots around the screen and keyboard.
import type { DeskItem } from '@shared/office';
import type { Box3 } from '../../iso/projection';
import { PAL } from '../palette';
import { type Part, blob, box, cyl } from './parts';

/** Desk-local frame: u along the desk's long edge (toward +x / +y), v from the far side (0) to the user's side (S). */
export type Frame = { L: number; S: number; toBox: (u0: number, u1: number, v0: number, v1: number, z: number, h: number) => Box3 };

/** Corners of the 0.5 × 0.5 spots items stand in, clear of the monitor (or laptop) and keyboard. */
export function deskSlots(L: number, S: number, laptop: boolean): [number, number][] {
  if (S < 1.3) return [[L - 0.65, S / 2 - 0.25], [0.15, S / 2 - 0.25], [0.75, S / 2 - 0.25], [L - 1.25, S / 2 - 0.25]];
  const corners: [number, number][] = [[L - 0.65, S - 0.65], [0.2, 0.15], [0.25, S - 0.65], [L - 0.55, 0.12]];
  const besideKeyboard: [number, number][] = L >= 3.1 ? [[L / 2 + 0.4, S - 0.6]] : [];
  const besideScreen: [number, number][] = laptop ? [] : [[0.8, 0.1]];
  return [...corners, ...besideKeyboard, ...besideScreen];
}

const BINDERS = ['#2f5c8a', '#c0392b', '#e8e2d0'];

export function itemParts(id: string, item: DeskItem, fr: Frame, u: number, v: number, z: number): Part[] {
  const b = (u0: number, u1: number, v0: number, v1: number, z0: number, h: number) => fr.toBox(u + u0, u + u1, v + v0, v + v1, z0, h);
  const centre = b(0.25, 0.25, 0.25, 0.25, z, 0);
  const cx = centre.x;
  const cy = centre.y;
  switch (item) {
    case 'papers':
      return [box(`${id}.papers`, b(0, 0.48, 0.02, 0.4, z, 0.07), '#e9e6de', PAL.paper)];
    case 'mug':
      return [cyl(`${id}.mug`, cx, cy, z, 0.12, 0.24, '#c4473a', '#7a2a22')];
    case 'boss-mug':
      return [{ ...cyl(`${id}.mug`, cx, cy, z, 0.14, 0.28, '#f5f3ee', '#6b5a48'), className: 'boss-mug' }];
    case 'phone':
      return [box(`${id}.phone`, b(0.02, 0.46, 0.08, 0.42, z, 0.1), '#33373e', '#4a4f57')];
    case 'lamp':
      return [cyl(`${id}.lamp-base`, cx, cy, z, 0.14, 0.05, '#7d6a3a'), box(`${id}.lamp-pole`, b(0.22, 0.28, 0.22, 0.28, z + 0.05, 0.5), '#9b8443'),
        blob(`${id}.lamp-head`, cx, cy, z + 0.62, 0.17, '#2f6b3e')];
    case 'plant':
      return [cyl(`${id}.pot`, cx, cy, z, 0.14, 0.22, PAL.pot), blob(`${id}.leaves`, cx, cy, z + 0.42, 0.24, PAL.plant)];
    case 'bobblehead':
      return [box(`${id}.bob-base`, b(0.12, 0.38, 0.12, 0.38, z, 0.06), '#3b3f46'), box(`${id}.bob-body`, b(0.18, 0.32, 0.18, 0.32, z + 0.06, 0.16), PAL.deskSide),
        { ...blob(`${id}.bob-head`, cx, cy, z + 0.38, 0.13, '#f0c8a0'), className: 'bobble-head' }];
    case 'candy':
      return [{ ...cyl(`${id}.jar`, cx, cy, z, 0.15, 0.32, '#d8eef5', '#eef8fb'), opacity: 0.85 },
        blob(`${id}.candy1`, cx, cy, z + 0.12, 0.07, '#e04b4b'), blob(`${id}.candy2`, cx + 0.04, cy - 0.04, z + 0.2, 0.06, '#f2c230')];
    case 'photo':
      return [box(`${id}.photo`, b(0.08, 0.42, 0.16, 0.26, z, 0.3), '#e8d9b5', '#6b4a2e', { stroke: '#6b4a2e' })];
    case 'nameplate':
      return [box(`${id}.nameplate`, b(0, 0.5, 0.1, 0.24, z, 0.12), '#2d2a26', '#c9a646')];
    case 'stapler-jello':
      return [{ ...box(`${id}.jello`, b(0.04, 0.46, 0.04, 0.46, z, 0.34), '#f1d43a', '#f7e27a'), opacity: 0.8 }];
    case 'tray': // a two-level in/out tray with paper in both
      return [
        box(`${id}.tray-low`, b(0.02, 0.46, 0.04, 0.44, z, 0.1), '#3a3f47', '#4a4f57'),
        box(`${id}.tray-paper`, b(0.07, 0.41, 0.08, 0.4, z + 0.1, 0.03), '#e9e6de', PAL.paper),
        box(`${id}.tray-high`, b(0.02, 0.46, 0.04, 0.44, z + 0.22, 0.07), '#3a3f47', '#565b63'),
        box(`${id}.tray-memo`, b(0.08, 0.4, 0.1, 0.38, z + 0.29, 0.03), '#e9e6de', '#f6f1c9'),
      ];
    case 'binders': // three binders standing upright
      return BINDERS.map((c, i) => box(`${id}.binder${i}`, b(0.03 + i * 0.14, 0.15 + i * 0.14, 0.06, 0.44, z, 0.42), c, c));
    case 'folders': // a stack of manila folders
      return [
        box(`${id}.folder1`, b(0, 0.48, 0.04, 0.4, z, 0.08), '#d9b77a', '#efd9a8'),
        box(`${id}.folder2`, b(0.05, 0.45, 0.1, 0.36, z + 0.08, 0.05), '#c9a464', '#e7cf98'),
      ];
    case 'pencup':
      return [
        cyl(`${id}.cup`, cx, cy, z, 0.1, 0.22, '#3a3f47', '#2a2d33'),
        box(`${id}.pen1`, b(0.2, 0.24, 0.2, 0.24, z + 0.22, 0.14), '#f2c230'),
        box(`${id}.pen2`, b(0.26, 0.29, 0.25, 0.28, z + 0.22, 0.12), '#2f5c8a'),
      ];
    default:
      return [];
  }
}
