// The visible faces of a ring-sector part (a curved desk): camera-facing outer, inner and end faces, far to near, then the top.
import { EYE, type Eye, type Vec3, facesCamera, viewDepth } from '../../iso/projection';
import { type ArcPart, arcPoints } from './parts';

export type ArcFace = { face: 'outer' | 'inner' | 'end' | 'top'; points: Vec3[]; tone: number };

/** 0 = lit like a box's x face (its `left` face), 1 = shaded like its y-min (`right`) face. */
const toneOf = (nx: number, ny: number) => {
  const l = Math.abs(nx);
  const r = Math.max(0, -ny);
  return l + r === 0 ? 0.5 : r / (l + r);
};

const wall = (a: { x: number; y: number }, b: { x: number; y: number }, z: number, h: number): Vec3[] => [
  { ...a, z }, { ...b, z }, { ...b, z: z + h }, { ...a, z: z + h },
];

const depthOf = (pts: Vec3[]) => viewDepth({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  z: pts.reduce((s, p) => s + (p.z ?? 0), 0) / pts.length,
});

const midOf = (a: { x: number; y: number }, b: { x: number; y: number }, z: number): Vec3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z });

export function arcFaces(p: ArcPart, eye: Eye = EYE): ArcFace[] {
  const outer = arcPoints(p, p.r1);
  const inner = arcPoints(p, p.r0);
  const sides: ArcFace[] = [];
  for (let i = 0; i + 1 < outer.length; i += 1) {
    const mid = ((p.a0 + ((p.a1 - p.a0) * (i + 0.5)) / (outer.length - 1)) * Math.PI) / 180;
    const nx = Math.cos(mid);
    const ny = Math.sin(mid);
    if (facesCamera(nx, ny, midOf(outer[i], outer[i + 1], p.z), eye)) {
      sides.push({ face: 'outer', points: wall(outer[i], outer[i + 1], p.z, p.h), tone: toneOf(nx, ny) });
    }
    if (facesCamera(-nx, -ny, midOf(inner[i], inner[i + 1], p.z), eye)) {
      sides.push({ face: 'inner', points: wall(inner[i], inner[i + 1], p.z, p.h), tone: toneOf(-nx, -ny) });
    }
  }
  const ends: [number, { x: number; y: number }, { x: number; y: number }, number][] = [
    [p.a0, inner[0], outer[0], -1], [p.a1, inner[inner.length - 1], outer[outer.length - 1], 1],
  ];
  for (const [deg, a, b, sign] of ends) {
    const t = (deg * Math.PI) / 180;
    const nx = -Math.sin(t) * sign;
    const ny = Math.cos(t) * sign;
    if (facesCamera(nx, ny, midOf(a, b, p.z), eye)) sides.push({ face: 'end', points: wall(a, b, p.z, p.h), tone: toneOf(nx, ny) });
  }
  const top = [...outer, ...[...inner].reverse()].map((q) => ({ ...q, z: p.z + p.h }));
  return [...sides.sort((a, b) => depthOf(b.points) - depthOf(a.points)), { face: 'top', points: top, tone: 0 }];
}
