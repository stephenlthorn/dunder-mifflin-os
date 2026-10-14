// Chairs (office, conference, armchair, stool) and Roy's forklift. `front` parts may cover the person sitting in them.
import type { ChairStyle, Facing, Seat } from '@shared/office';
import { shade } from '../../iso/color';
import type { Box3 } from '../../iso/projection';
import { PAL } from '../palette';
import { type Part, box, cyl } from './parts';

export type ChairParts = { behind: Part[]; front: Part[] };

/** Box for a slab on the back side of a chair centred at (x, y) facing `facing`. */
function backSlab(x: number, y: number, facing: Facing, half: number, thick: number, z: number, h: number): Box3 {
  switch (facing) {
    case 's': return { x: x - half, y: y + half - thick, z, w: half * 2, d: thick, h };
    case 'n': return { x: x - half, y: y - half, z, w: half * 2, d: thick, h };
    case 'w': return { x: x + half - thick, y: y - half, z, w: thick, d: half * 2, h };
    default: return { x: x - half, y: y - half, z, w: thick, d: half * 2, h };
  }
}

/** The back rest sits between the camera and the sitter when they face away (n / e). */
const backInFront = (facing: Facing) => facing === 'n' || facing === 'e';

export function chairParts(id: string, style: ChairStyle, x: number, y: number, facing: Facing, color?: string): ChairParts {
  if (style === 'forklift') return forkliftParts(id, x, y, facing);
  if (style === 'none') return { behind: [], front: [] }; // a place to stand
  const c = color ?? (style === 'armchair' ? '#7a5c4a' : style === 'conference' ? '#2f3338' : PAL.chair);
  const top = shade(c, 0.18);
  if (style === 'stool') {
    return { behind: [cyl(`${id}.base`, x, y, 0, 0.36, 0.05, '#2d3035'), cyl(`${id}.pole`, x, y, 0.05, 0.06, 0.7, '#7d838b'), cyl(`${id}.seat`, x, y, 0.75, 0.38, 0.15, c, top)], front: [] };
  }
  if (style === 'armchair') {
    const half = 0.6;
    const seat = box(`${id}.seat`, { x: x - half, y: y - half, z: 0, w: half * 2, d: half * 2, h: 0.8 }, c, top);
    const back = box(`${id}.back`, backSlab(x, y, facing, half, 0.32, 0.8, 1.05), c, top);
    const alongX = facing === 'n' || facing === 's';
    const armA: Box3 = alongX ? { x: x - half, y: y - half, z: 0.8, w: 0.22, d: half * 2, h: 0.4 } : { x: x - half, y: y - half, z: 0.8, w: half * 2, d: 0.22, h: 0.4 };
    const armB: Box3 = alongX ? { ...armA, x: x + half - 0.22 } : { ...armA, y: y + half - 0.22 };
    const arms = [box(`${id}.armA`, armA, shade(c, -0.05), top), box(`${id}.armB`, armB, shade(c, -0.05), top)];
    return backInFront(facing) ? { behind: [seat, arms[1]], front: [back, arms[0]] } : { behind: [seat, back, arms[1]], front: [arms[0]] };
  }
  const half = 0.5;
  const base = style === 'conference'
    ? [box(`${id}.leg`, { x: x - 0.05, y: y - 0.05, z: 0, w: 0.1, d: 0.1, h: 0.75 }, '#7d838b'), cyl(`${id}.foot`, x, y, 0, 0.42, 0.04, '#5d636b')]
    : [cyl(`${id}.base`, x, y, 0, 0.45, 0.06, '#26292e'), box(`${id}.pole`, { x: x - 0.05, y: y - 0.05, z: 0.06, w: 0.1, d: 0.1, h: 0.69 }, '#7d838b')];
  const seat = box(`${id}.seat`, { x: x - half, y: y - half, z: 0.75, w: half * 2, d: half * 2, h: 0.17 }, c, top);
  const back = box(`${id}.back`, backSlab(x, y, facing, half - 0.05, 0.16, 0.98, style === 'conference' ? 0.9 : 1.05), c, top);
  return backInFront(facing) ? { behind: [...base, seat], front: [back] } : { behind: [...base, seat, back], front: [] };
}

function forkliftParts(id: string, x: number, y: number, facing: Facing): ChairParts {
  // Built for facing 'w' (forks toward −x); other facings are not used in the floor plan.
  const yellow = '#e9b824';
  const body: Box3 = { x: x - 1.0, y: y - 0.8, z: 0.25, w: 2.2, d: 1.6, h: 0.75 };
  const wheel = (k: string, wx: number, wy: number) => cyl(`${id}.wheel${k}`, wx, wy, 0, 0.28, 0.3, '#26292e');
  const behind: Part[] = [
    wheel('a', x + 0.7, y + 0.65), wheel('b', x - 0.6, y + 0.65),
    box(`${id}.body`, body, yellow, '#f2cf55'),
    box(`${id}.counterweight`, { x: x + 0.75, y: y - 0.75, z: 1, w: 0.45, d: 1.5, h: 0.6 }, '#c99a12', '#e0b52c'),
    box(`${id}.seat`, { x: x - 0.4, y: y - 0.45, z: 1, w: 0.8, d: 0.9, h: 0.15 }, '#2d3035'),
    box(`${id}.post-back-a`, { x: x + 0.65, y: y + 0.65, z: 1, w: 0.08, d: 0.08, h: 2.1 }, '#2d3035'),
    box(`${id}.post-back-b`, { x: x + 0.65, y: y - 0.73, z: 1, w: 0.08, d: 0.08, h: 2.1 }, '#2d3035'),
  ];
  const front: Part[] = [
    wheel('c', x + 0.7, y - 0.65), wheel('d', x - 0.6, y - 0.65),
    box(`${id}.mast-a`, { x: x - 1.4, y: y - 0.7, z: 0.1, w: 0.14, d: 0.14, h: 3 }, '#3b3f46'),
    box(`${id}.mast-b`, { x: x - 1.4, y: y + 0.56, z: 0.1, w: 0.14, d: 0.14, h: 3 }, '#3b3f46'),
    box(`${id}.carriage`, { x: x - 1.55, y: y - 0.6, z: 0.3, w: 0.12, d: 1.2, h: 0.8 }, '#3b3f46'),
    box(`${id}.fork-a`, { x: x - 2.6, y: y - 0.45, z: 0.12, w: 1.05, d: 0.16, h: 0.06 }, '#5d636b'),
    box(`${id}.fork-b`, { x: x - 2.6, y: y + 0.29, z: 0.12, w: 1.05, d: 0.16, h: 0.06 }, '#5d636b'),
  ];
  return facing === 'w' ? { behind, front } : { behind: [...behind, ...front], front: [] };
}

export function seatParts(seat: Seat): ChairParts {
  return chairParts(seat.id, seat.chair, seat.x, seat.y, seat.facing);
}
