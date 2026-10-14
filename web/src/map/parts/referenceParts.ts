// Furniture seen in the Drawbotics render: Pam's curved reception desk, the DUNDER MIFFLIN wall sign, cubicle
// partitions, the HR bulletin board, supply shelves with paper reams, open shelving full of coloured binders and the
// Conference Room's TV on a stand.
import type { Facing, Furniture } from '@shared/office';
import { shade } from '../../iso/color';
import type { Box3, Vec3 } from '../../iso/projection';
import { PAL } from '../palette';
import { type Decal, type Part, arc, box, cyl, faceRect, facingFace } from './parts';

const RAD = Math.PI / 180;
const fb = (f: Furniture, h: number, z = 0): Box3 => ({ x: f.x, y: f.y, z: f.z ?? z, w: f.w, d: f.d, h });

/** Plan angle (degrees) a facing points to: the convex side of a curved desk faces this way. */
const ANGLE: Record<Facing, number> = { e: 0, n: 90, w: 180, s: 270 };
const SPAN = 75; // half the sweep of the curved desk

/** The curved desk's geometry: centre of the arc, radii, height and a point at an angle along it. */
function receptionDesk(f: Furniture) {
  const facing = f.facing ?? 'w';
  const mid = ANGLE[facing];
  const alongX = facing === 'n' || facing === 's';
  const length = alongX ? f.w : f.d;
  const r1 = length / (2 * Math.sin(SPAN * RAD));
  const r0 = Math.max(0.6, r1 - 1.3);
  const inset = r0 * Math.cos(SPAN * RAD);
  const cx = facing === 'w' ? f.x + f.w + inset : facing === 'e' ? f.x - inset : f.x + f.w / 2;
  const cy = facing === 's' ? f.y + f.d + inset : facing === 'n' ? f.y - inset : f.y + f.d / 2;
  const h = f.h ?? 1.45;
  const at = (deg: number, r: number) => ({ x: cx + r * Math.cos((mid + deg) * RAD), y: cy + r * Math.sin((mid + deg) * RAD) });
  return { mid, r0, r1, cx, cy, h, at, ri: r0 + 0.45 };
}

/** Where the reception phone sits (top of its handset): Pam's phone rings here when anyone needs you. */
export function receptionPhoneSpot(f: Furniture): Vec3 {
  const d = receptionDesk(f);
  const phone = d.at(-42, d.ri);
  return { x: phone.x, y: phone.y, z: d.h + 0.1 };
}

export function receptionDeskParts(f: Furniture): Part[] {
  const { mid, r0, r1, cx, cy, h, at, ri } = receptionDesk(f);
  const wood = f.color ?? PAL.deskSide;
  const mon = at(-8, ri);
  const phone = at(-42, ri);
  const jar = at(38, ri);
  const memo = at(14, ri);
  return [
    arc(`${f.id}.desk`, cx, cy, 0, r0, r1, mid - SPAN, mid + SPAN, h, wood, PAL.deskTop),
    { ...arc(`${f.id}.ledge`, cx, cy, h, r1 - 0.42, r1, mid - SPAN, mid + SPAN, 0.42, '#b9cfcf', '#dcebea'), opacity: 0.92 },
    box(`${f.id}.monitor`, { x: mon.x - 0.3, y: mon.y - 0.3, z: h, w: 0.6, d: 0.6, h: 0.75 }, PAL.monitor, '#3d424b'),
    box(`${f.id}.phone`, { x: phone.x - 0.22, y: phone.y - 0.18, z: h, w: 0.44, d: 0.36, h: 0.1 }, '#33373e', '#4a4f57'),
    box(`${f.id}.memo`, { x: memo.x - 0.24, y: memo.y - 0.2, z: h, w: 0.48, d: 0.4, h: 0.06 }, '#e9e6de', PAL.paper),
    { ...cyl(`${f.id}.jar`, jar.x, jar.y, h, 0.16, 0.34, '#d8eef5', '#eef8fb'), opacity: 0.85 },
  ];
}

/** A wall-mounted sign: dark panel, light border and its label (one word per line) on the camera-facing face. */
export function wallSignParts(f: Furniture): Part[] {
  const z = f.z ?? 1;
  const h = f.h ?? 1.3;
  const onX = f.facing !== 'w'; // facing 's': the face lies on y = f.y and text runs along x
  const [u0, u1] = onX ? [f.x, f.x + f.w] : [f.y, f.y + f.d];
  const plane = onX ? f.y : f.x;
  const axis = onX ? 'y' : 'x';
  const words = (f.label ?? '').split(' ').filter(Boolean);
  const size = Math.min(h * 0.32, ((u1 - u0) * 1.25) / Math.max(1, ...words.map((w) => w.length)));
  const lineGap = h / (words.length + 1);
  const text: Decal[] = words.map((word, i) => ({
    kind: 'text', axis: onX ? 'x' : 'y', text: word, size, fill: '#f4f2ee', weight: 800, anchor: 'middle',
    at: (onX ? { x: (u0 + u1) / 2, y: plane, z: z + h - lineGap * (i + 1) - size * 0.36 } : { x: plane, y: (u0 + u1) / 2, z: z + h - lineGap * (i + 1) - size * 0.36 }) as Vec3,
  }));
  return [box(`${f.id}.panel`, fb(f, h, z), '#2a2c30', '#3a3d42', {
    decals: [
      faceRect(axis, plane, u0 + 0.06, u1 - 0.06, z + 0.06, z + h - 0.06, '#e9e6de'),
      faceRect(axis, plane, u0 + 0.12, u1 - 0.12, z + 0.12, z + h - 0.12, '#2a2c30'),
      ...text,
    ],
  })];
}

/** A cubicle partition: grey fabric panel with a darker top rail. */
export function partitionParts(f: Furniture): Part[] {
  const h = f.h ?? 2.3;
  const c = f.color ?? '#8f959b';
  return [
    box(`${f.id}.panel`, fb(f, h - 0.08), c, shade(c, 0.2)),
    box(`${f.id}.rail`, { ...fb(f, 0.08), z: (f.z ?? 0) + h - 0.08 }, '#6d7278', '#9aa0a6'),
  ];
}

/** A cork board with pinned notes, on the face it faces (x-min for 'w', x-max for 'e', y-min for 's'). */
export function bulletinParts(f: Furniture): Part[] {
  const z = f.z ?? 0.9;
  const h = f.h ?? 1.4;
  const face = facingFace(f, f.facing ?? 'w');
  const [u0, u1] = [face.u0, face.u0 + face.len];
  const plane = face.at;
  const axis = face.plane;
  const notes = ['#fbfaf6', '#f6e27a', '#f2a7b8', '#9cc3e6', '#fbfaf6', '#a8d8a0', '#f6e27a', '#fbfaf6'];
  const cols = Math.max(2, Math.floor((u1 - u0) / 0.55));
  const decals: Decal[] = [faceRect(axis, plane, u0 + 0.08, u1 - 0.08, z + 0.08, z + h - 0.08, '#c9a06a')];
  notes.slice(0, cols * 2).forEach((fill, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const a = u0 + 0.2 + col * ((u1 - u0 - 0.4) / cols);
    const zb = z + 0.25 + row * (h * 0.4) + ((i * 7) % 3) * 0.04;
    decals.push(faceRect(axis, plane, a, a + 0.32, zb, zb + 0.36, fill));
  });
  return [box(`${f.id}.board`, fb(f, h, z), '#8a6240', '#a77c55', { decals })];
}

/** A low grey supply cabinet with stacks of coloured paper reams on top. */
export function suppliesParts(f: Furniture): Part[] {
  const h = f.h ?? 1.2;
  const reams = ['#f2a7b8', '#9cc3e6', '#fbfaf6', '#a8d8a0', '#f3e19a', '#f2a7b8', '#fbfaf6'];
  const alongX = f.w >= f.d;
  const len = alongX ? f.w : f.d;
  const n = Math.max(1, Math.floor((len - 0.2) / 0.75));
  const stacks = Array.from({ length: n }, (_, i): Part => {
    const u = 0.15 + i * ((len - 0.3) / n);
    const sh = 0.18 + ((i * 5) % 4) * 0.08;
    const b: Box3 = alongX
      ? { x: f.x + u, y: f.y + 0.12, z: h, w: 0.55, d: f.d - 0.24, h: sh }
      : { x: f.x + 0.12, y: f.y + u, z: h, w: f.w - 0.24, d: 0.55, h: sh };
    return box(`${f.id}.ream${i}`, b, reams[i % reams.length], shade(reams[i % reams.length], 0.3));
  });
  const doors = Array.from({ length: Math.max(1, Math.floor(len / 1.2)) - 1 }, (_, i) => {
    const u = (i + 1) * 1.2;
    return (alongX ? [{ x: f.x + u, y: f.y, z: 0.1 }, { x: f.x + u, y: f.y, z: h - 0.1 }] : [{ x: f.x, y: f.y + u, z: 0.1 }, { x: f.x, y: f.y + u, z: h - 0.1 }]) as [Vec3, Vec3];
  });
  return [box(`${f.id}.body`, fb(f, h), '#b4b8bd', '#cdd0d4', { decals: [{ kind: 'lines', segments: doors, stroke: '#8e9399', width: 0.6 }] }), ...stacks];
}

/** A TV on a wheeled stand; the screen faces `facing` (only 'w' and 's' screens face the camera). */
export function tvStandParts(f: Furniture): Part[] {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.d / 2;
  const top = f.h ?? 2.4;
  const alongY = f.facing === 'w' || f.facing === 'e';
  const screen: Box3 = alongY
    ? { x: cx - 0.12, y: f.y, z: top - 1.35, w: 0.24, d: f.d, h: 1.35 }
    : { x: f.x, y: cy - 0.12, z: top - 1.35, w: f.w, d: 0.24, h: 1.35 };
  const face = facingFace(screen, f.facing ?? 's');
  const decal = [faceRect(face.plane, face.at, face.u0 + 0.1, face.u0 + face.len - 0.1, screen.z + 0.1, screen.z + screen.h - 0.1, '#2c4a6e')];
  return [
    box(`${f.id}.base`, { x: cx - Math.min(0.45, f.w / 2), y: cy - Math.min(0.45, f.d / 2), z: 0, w: Math.min(0.9, f.w), d: Math.min(0.9, f.d), h: 0.08 }, '#2d3035'),
    box(`${f.id}.pole`, { x: cx - 0.06, y: cy - 0.06, z: 0.08, w: 0.12, d: 0.12, h: top - 1.43 }, '#5d636b'),
    box(`${f.id}.tv`, screen, '#22262c', '#33383f', { decals: decal }),
  ];
}

const SHELF_COLOURS = ['#f2a7b8', '#b5d96a', '#9cc3e6', '#fbfaf6', '#f3e19a', '#e06c6c', '#7cc6bd', '#c9b2e0'];

/** Open white shelving packed with coloured binders and boxes, on the face it faces (y-min for 's', x-max for 'e', else x-min). */
export function supplyShelfParts(f: Furniture): Part[] {
  const h = f.h ?? 2.2;
  const onY = f.facing === 's';
  const { plane: axis, at: plane, u0, len } = facingFace(f, f.facing ?? 'w');
  const rows = Math.max(2, Math.round(h / 0.7));
  const per = Math.max(3, Math.floor((len - 0.2) / 0.28));
  const slot = (len - 0.2) / per;
  const decals: Decal[] = [faceRect(axis, plane, u0 + 0.06, u0 + len - 0.06, 0.06, h - 0.06, '#d9d6cf')];
  for (let r = 0; r < rows; r += 1) {
    const z0 = 0.1 + (r * (h - 0.2)) / rows;
    const z1 = z0 + (h - 0.2) / rows - 0.08;
    for (let i = 0; i < per; i += 1) {
      const a = u0 + 0.1 + i * slot;
      decals.push(faceRect(axis, plane, a + 0.02, a + slot - 0.02, z0 + 0.02, z1 - ((i + r) % 3) * 0.06, SHELF_COLOURS[(i * 3 + r * 5) % SHELF_COLOURS.length]));
    }
  }
  const reams = [0.15, 0.85].filter((u) => u + 0.55 <= len).map((u, i): Part => {
    const b: Box3 = onY ? { x: f.x + u, y: f.y + 0.1, z: h, w: 0.55, d: f.d - 0.2, h: 0.22 + i * 0.1 } : { x: f.x + 0.1, y: f.y + u, z: h, w: f.w - 0.2, d: 0.55, h: 0.22 + i * 0.1 };
    return box(`${f.id}.ream${i}`, b, SHELF_COLOURS[i * 2], shade(SHELF_COLOURS[i * 2], 0.25));
  });
  return [box(`${f.id}.body`, fb(f, h), '#eeece6', '#f7f5f0', { decals }), ...reams];
}
