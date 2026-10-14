// 2.5D projection: world units (1 ≈ 0.5 m; x → right, y → back, z → up) to SVG screen pixels.
// A pinhole camera like the one in the Drawbotics render: it hangs above the front of the building, a little left of
// its middle, turned YAW degrees off the building's long axis and pitched ELEVATION degrees down at TARGET (the middle
// of the bullpen), DISTANCE units away. Things nearer the camera draw larger (scaleAt), depth lines converge (the
// back wall reads shorter than the front, the right end leans far more than the left), and verticals lean a little
// toward the edges. Visibility (which side of a box the camera sees) and the painter's sort follow the camera's
// position, EYE: walls left of it show their right-hand face, walls right of it their left-hand face.

export type Vec3 = { x: number; y: number; z?: number };
export type Pt = { x: number; y: number };
export type Box3 = { x: number; y: number; z: number; w: number; d: number; h: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export type Eye = { x: number; y: number; z: number };

export const UNIT_PX = 20;
const DEG = Math.PI / 180;
const ELEVATION = 50 * DEG;
const YAW = 24 * DEG;
const DISTANCE = 58;
const TARGET = { x: 32, y: 16, z: 0 }; // draws at the screen origin, at scale 1

const COS_Y = Math.cos(YAW);
const SIN_Y = Math.sin(YAW);
const SIN_E = Math.sin(ELEVATION);
const COS_E = Math.cos(ELEVATION);

/** Screen pixels per world unit of height (z), at scale 1. */
export const Z_PX = UNIT_PX * COS_E;
/** A world circle of radius r projects to an ellipse with rx = r·UNIT_PX and ry = r·ELLIPSE_RY (times scaleAt). */
export const ELLIPSE_RY = UNIT_PX * SIN_E;

/** Camera-space coordinates of a world point, relative to the target: across (right), up (screen up), depth (away). */
function toCamera(p: Vec3): { across: number; up: number; depth: number } {
  const rx = p.x - TARGET.x;
  const ry = p.y - TARGET.y;
  const rz = (p.z ?? 0) - TARGET.z;
  const along = rx * SIN_Y + ry * COS_Y;
  return { across: rx * COS_Y - ry * SIN_Y, up: along * SIN_E + rz * COS_E, depth: along * COS_E - rz * SIN_E };
}

/** Where the camera hangs: DISTANCE units back from the target, against the view direction. */
export const EYE: Eye = {
  x: TARGET.x - DISTANCE * COS_E * SIN_Y,
  y: TARGET.y - DISTANCE * COS_E * COS_Y,
  z: TARGET.z + DISTANCE * SIN_E,
};

/** How much larger than at the target a small thing at p is drawn (> 1 nearer the camera). */
export function scaleAt(p: Vec3): number {
  return DISTANCE / (DISTANCE + toCamera(p).depth);
}

export function project(p: Vec3): Pt {
  const c = toCamera(p);
  const s = DISTANCE / (DISTANCE + c.depth);
  return { x: c.across * UNIT_PX * s, y: -c.up * UNIT_PX * s };
}

/** Inverse of `project` for points on the horizontal plane at height z: cast the pixel's ray from the eye. */
export function unproject(pt: Pt, z = 0): { x: number; y: number } {
  // across = sx·k, up = −sy·k with k = (DISTANCE + depth) / (UNIT_PX·DISTANCE); the plane fixes up·cosE − depth·sinE
  const rz = z - TARGET.z;
  const a = pt.x / (UNIT_PX * DISTANCE);
  const b = -pt.y / (UNIT_PX * DISTANCE);
  const depth = (rz - b * DISTANCE * COS_E) / (b * COS_E - SIN_E);
  const k = DISTANCE + depth;
  const across = a * k;
  const along = b * k * SIN_E + depth * COS_E;
  return { x: TARGET.x + across * COS_Y + along * SIN_Y, y: TARGET.y - across * SIN_Y + along * COS_Y };
}

/** Depth along the view direction; larger is further from the camera. */
export function viewDepth(p: Vec3): number {
  return toCamera(p).depth;
}

/** Whether a vertical face through `at` with plan normal (nx, ny) points toward the eye. */
export function facesCamera(nx: number, ny: number, at: Vec3, eye: Eye = EYE): boolean {
  return (eye.x - at.x) * nx + (eye.y - at.y) * ny > 1e-9;
}

export type BoxFaces = { top: Pt[]; left: Pt[]; right: Pt[] };

/**
 * The faces the camera can see: the top, the x face toward the eye (`left`: x-min when the eye is to the box's left,
 * x-max when it is to its right, none when the eye is above the box's x span) and the y-min face (`right`).
 */
export function boxFaces(b: Box3, eye: Eye = EYE): BoxFaces {
  const x1 = b.x + b.w;
  const y1 = b.y + b.d;
  const z1 = b.z + b.h;
  const xFace = eye.x < b.x ? b.x : eye.x > x1 ? x1 : null;
  const yFace = eye.y < b.y ? b.y : eye.y > y1 ? y1 : null;
  return {
    top: [
      project({ x: b.x, y: b.y, z: z1 }),
      project({ x: x1, y: b.y, z: z1 }),
      project({ x: x1, y: y1, z: z1 }),
      project({ x: b.x, y: y1, z: z1 }),
    ],
    left: xFace === null ? [] : [
      project({ x: xFace, y: b.y, z: b.z }),
      project({ x: xFace, y: y1, z: b.z }),
      project({ x: xFace, y: y1, z: z1 }),
      project({ x: xFace, y: b.y, z: z1 }),
    ],
    right: yFace === null ? [] : [
      project({ x: b.x, y: yFace, z: b.z }),
      project({ x: x1, y: yFace, z: b.z }),
      project({ x: x1, y: yFace, z: z1 }),
      project({ x: b.x, y: yFace, z: z1 }),
    ],
  };
}

export function boxCorners(b: Box3): Pt[] {
  const pts: Pt[] = [];
  for (const x of [b.x, b.x + b.w]) {
    for (const y of [b.y, b.y + b.d]) {
      for (const z of [b.z, b.z + b.h]) pts.push(project({ x, y, z }));
    }
  }
  return pts;
}

export function boundsOf(points: readonly Pt[]): Bounds {
  return points.reduce<Bounds>(
    (acc, p) => ({
      minX: Math.min(acc.minX, p.x),
      minY: Math.min(acc.minY, p.y),
      maxX: Math.max(acc.maxX, p.x),
      maxY: Math.max(acc.maxY, p.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

export function screenBounds(b: Box3): Bounds {
  return boundsOf(boxCorners(b));
}

const fmt = (v: number) => String(Number(v.toFixed(2)));

/** SVG path through the points; empty for no points (a face the camera can't see). */
export function toPath(points: readonly Pt[], closed = true): string {
  if (points.length === 0) return '';
  const body = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p.x)} ${fmt(p.y)}`).join('');
  return closed ? `${body}Z` : body;
}

/** Path for a flat rectangle on the plane z (floors, rugs, tops). */
export function rectPath(x: number, y: number, w: number, d: number, z = 0): string {
  return toPath([
    project({ x, y, z }),
    project({ x: x + w, y, z }),
    project({ x: x + w, y: y + d, z }),
    project({ x, y: y + d, z }),
  ]);
}
