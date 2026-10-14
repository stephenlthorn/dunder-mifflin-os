// Which face of its part a decal is painted on, and whether the camera can see that face (so a screen on the far
// side of a monitor, or binders on the back of a shelf, are not drawn through the box).
import { type Box3, EYE, type Eye, type Vec3 } from '../../iso/projection';
import type { Decal } from './parts';

type Face = 'x0' | 'x1' | 'y0' | 'y1' | 'top' | 'bottom';
const EPS = 0.02;

function pointsOf(d: Decal): Vec3[] {
  if (d.kind === 'poly') return d.points;
  if (d.kind === 'lines') return d.segments.flat();
  return [d.at];
}

/** The box faces all of the decal's points lie on: none when it isn't on a face, two when it runs along an edge. */
export function decalFaces(b: Box3, d: Decal): Face[] {
  const pts = pointsOf(d);
  const all = (get: (p: Vec3) => number, v: number) => pts.every((p) => Math.abs(get(p) - v) < EPS);
  const onX = d.kind !== 'text' || d.axis === 'y'; // text along x lies on a y plane, and vice versa
  const onY = d.kind !== 'text' || d.axis === 'x';
  const flat = d.kind !== 'text';
  const checks: [Face, boolean][] = [
    ['x0', onX && all((p) => p.x, b.x)], ['x1', onX && all((p) => p.x, b.x + b.w)],
    ['y0', onY && all((p) => p.y, b.y)], ['y1', onY && all((p) => p.y, b.y + b.d)],
    ['top', flat && all((p) => p.z ?? 0, b.z + b.h)], ['bottom', flat && all((p) => p.z ?? 0, b.z)],
  ];
  return checks.filter(([, on]) => on).map(([face]) => face);
}

const sees = (b: Box3, face: Face, eye: Eye): boolean => {
  switch (face) {
    case 'x0': return eye.x < b.x;
    case 'x1': return eye.x > b.x + b.w;
    case 'y0': return eye.y < b.y;
    case 'y1': return eye.y > b.y + b.d;
    case 'top': return eye.z > b.z + b.h;
    default: return eye.z < b.z;
  }
};

export function decalVisible(b: Box3, d: Decal, eye: Eye = EYE): boolean {
  const faces = decalFaces(b, d);
  return faces.length === 0 || faces.some((face) => sees(b, face, eye));
}
