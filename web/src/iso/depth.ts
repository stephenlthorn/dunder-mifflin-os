// Painter's algorithm for axis-aligned boxes: a topological sort over "in front of" relations between boxes
// that overlap on screen, falling back to view depth for intersecting boxes and cycles.
import { type Bounds, type Box3, EYE, type Eye, screenBounds, viewDepth } from './projection';

const EPS = 1e-6;

/**
 * Two boxes split by a plane across one axis: the one on the eye's side of the plane is nearer. `lo` ends before
 * `hi` starts; the result says whether `lo` is the nearer one (with the eye inside the gap, neither can hide the other).
 */
const loIsNearer = (loEnd: number, hiStart: number, eye: number) => eye < (loEnd + hiStart) / 2;

/**
 * What each axis that splits the boxes says about "is `a` nearer than `b`" (`lo` ends at loEnd, `hi` starts at hiStart).
 * With the eye on one side of the gap, the box on that side is nearer; with the eye inside the gap, neither box can hide
 * the other, so the axis says both.
 */
function axisVerdicts(aLo: boolean, loEnd: number, hiStart: number, eye: number): boolean[] {
  const loNearer = eye <= loEnd ? [true] : eye >= hiStart ? [false] : [true, false];
  return loNearer.map((v) => (aLo ? v : !v));
}

/**
 * true: paint `a` after `b` (only `a` can hide `b`); false: paint it before; 'either': no plane lets either box hide
 * the other, so their order doesn't matter; null: the boxes intersect.
 */
export function paintOrder(a: Box3, b: Box3, eye: Eye = EYE): boolean | 'either' | null {
  const verdicts: boolean[] = [];
  const split = (a0: number, a1: number, b0: number, b1: number, e: number) => {
    if (a1 <= b0 + EPS) verdicts.push(...axisVerdicts(true, a1, b0, e));
    else if (b1 <= a0 + EPS) verdicts.push(...axisVerdicts(false, b1, a0, e));
  };
  split(a.x, a.x + a.w, b.x, b.x + b.w, eye.x);
  split(a.y, a.y + a.d, b.y, b.y + b.d, eye.y);
  split(a.z, a.z + a.h, b.z, b.z + b.h, eye.z);
  if (verdicts.length === 0) return null;
  if (verdicts.every((v) => v)) return true;
  return verdicts.every((v) => !v) ? false : 'either';
}

/** true if `a` must be painted after `b`; false if before; null if the boxes intersect. */
export function inFront(a: Box3, b: Box3, eye: Eye = EYE): boolean | null {
  if (a.x + a.w <= b.x + EPS) return loIsNearer(a.x + a.w, b.x, eye.x);
  if (b.x + b.w <= a.x + EPS) return !loIsNearer(b.x + b.w, a.x, eye.x);
  if (a.y + a.d <= b.y + EPS) return loIsNearer(a.y + a.d, b.y, eye.y);
  if (b.y + b.d <= a.y + EPS) return !loIsNearer(b.y + b.d, a.y, eye.y);
  if (a.z >= b.z + b.h - EPS) return !loIsNearer(b.z + b.h, a.z, eye.z);
  if (b.z >= a.z + a.h - EPS) return loIsNearer(a.z + a.h, b.z, eye.z);
  return null;
}

const overlaps = (a: Bounds, b: Bounds) =>
  a.minX < b.maxX - 0.01 && b.minX < a.maxX - 0.01 && a.minY < b.maxY - 0.01 && b.minY < a.maxY - 0.01;

const centreDepth = (b: Box3) => viewDepth({ x: b.x + b.w / 2, y: b.y + b.d / 2, z: b.z + b.h / 2 });

export type Sortable = { id: string; box: Box3 };

export function depthSort<T extends Sortable>(items: readonly T[], eye: Eye = EYE): T[] {
  const n = items.length;
  const bounds = items.map((i) => screenBounds(i.box));
  const depth = items.map((i) => centreDepth(i.box));
  const after: number[][] = items.map(() => []); // after[b] = items painted after b
  const blockers = new Array<number>(n).fill(0);

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (!overlaps(bounds[i], bounds[j])) continue;
      const rel = paintOrder(items[i].box, items[j].box, eye);
      if (rel === 'either') continue; // neither can hide the other: no constraint, so no false cycles
      const iLater = rel ?? depth[i] < depth[j];
      const [first, later] = iLater ? [j, i] : [i, j];
      after[first].push(later);
      blockers[later] += 1;
    }
  }

  const done = new Array<boolean>(n).fill(false);
  const out: T[] = [];
  const pickFurthest = (onlyReady: boolean) => {
    let best = -1;
    for (let k = 0; k < n; k += 1) {
      if (done[k] || (onlyReady && blockers[k] > 0)) continue;
      if (best < 0 || depth[k] > depth[best] + EPS || (Math.abs(depth[k] - depth[best]) <= EPS && items[k].id < items[best].id)) best = k;
    }
    return best;
  };

  while (out.length < n) {
    const next = pickFurthest(true);
    const k = next >= 0 ? next : pickFurthest(false); // cycle: break it at the furthest item
    done[k] = true;
    out.push(items[k]);
    for (const later of after[k]) blockers[later] -= 1;
  }
  return out;
}
