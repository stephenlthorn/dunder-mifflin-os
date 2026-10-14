// Office furniture other than desks: tables, seating, storage, appliances and decor.
import type { Furniture } from '@shared/office';
import { shade } from '../../iso/color';
import type { Box3 } from '../../iso/projection';
import { PAL } from '../palette';
import { type Part, blob, box, cyl, faceRect, facingFace, flatRect } from './parts';

const fb = (f: Furniture, h: number, z = 0): Box3 => ({ x: f.x, y: f.y, z: f.z ?? z, w: f.w, d: f.d, h });
const inset = (b: Box3, i: number): Box3 => ({ ...b, x: b.x + i, y: b.y + i, w: b.w - 2 * i, d: b.d - 2 * i });

export function tableParts(f: Furniture): Part[] {
  const h = f.h ?? 1.5;
  const side = f.color ?? PAL.deskSide;
  const top = shade(side, 0.25);
  const leg = (id: string, x: number, y: number) => box(`${f.id}.${id}`, { x, y, z: 0, w: 0.16, d: 0.16, h: h - 0.12 }, shade(side, -0.15));
  const parts: Part[] = [
    leg('l1', f.x + 0.2, f.y + 0.2), leg('l2', f.x + f.w - 0.36, f.y + 0.2),
    leg('l3', f.x + 0.2, f.y + f.d - 0.36), leg('l4', f.x + f.w - 0.36, f.y + f.d - 0.36),
    box(`${f.id}.top`, { ...fb(f, 0.12), z: h - 0.12 }, side, top),
  ];
  (f.items ?? []).forEach((item, i) => {
    const x = f.x + 0.6 + i * ((f.w - 1.2) / Math.max(1, (f.items?.length ?? 1) - 1 || 1));
    const y = f.y + (i % 2 === 0 ? 0.55 : f.d - 0.95);
    if (item === 'papers') parts.push(box(`${f.id}.p${i}`, { x, y, z: h, w: 0.5, d: 0.38, h: 0.05 }, '#e9e6de', PAL.paper));
    if (item === 'mug') parts.push(cyl(`${f.id}.m${i}`, x + 0.15, y + 0.15, h, 0.12, 0.22, '#f3f1ec', '#5b4636'));
    if (item === 'phone') parts.push(box(`${f.id}.ph${i}`, { x: f.x + f.w / 2 - 0.3, y: f.y + f.d / 2 - 0.25, z: h, w: 0.6, d: 0.5, h: 0.08 }, '#2b2f36', '#3d424b'));
  });
  return parts;
}

export function roundTableParts(f: Furniture): Part[] {
  const h = f.h ?? 1.5;
  const cx = f.x + f.w / 2;
  const cy = f.y + f.d / 2;
  const r = Math.min(f.w, f.d) / 2;
  return [
    cyl(`${f.id}.base`, cx, cy, 0, r * 0.4, 0.08, '#6f6a63'),
    cyl(`${f.id}.stem`, cx, cy, 0.08, 0.12, h - 0.2, '#7b766f'),
    cyl(`${f.id}.top`, cx, cy, h - 0.12, r, 0.12, '#e7e1d6', '#f4efe6'),
    cyl(`${f.id}.mug`, cx + 0.4, cy - 0.3, h, 0.12, 0.22, '#3d7fb8', '#244c6e'),
  ];
}

export function coffeeTableParts(f: Furniture): Part[] {
  const h = f.h ?? 0.8;
  const parts: Part[] = [
    box(`${f.id}.base`, { ...inset(fb(f, h - 0.1), 0.12) }, '#6f5440'),
    box(`${f.id}.top`, { ...fb(f, 0.1), z: h - 0.1 }, '#8a6a4f', '#a8835f'),
  ];
  if (f.items?.includes('papers')) parts.push(box(`${f.id}.mag`, { x: f.x + 0.2, y: f.y + 0.25, z: h, w: 0.5, d: 0.4, h: 0.04 }, '#d14b4b', '#e8c9a8'));
  if (f.items?.includes('mug')) parts.push(cyl(`${f.id}.mug`, f.x + f.w - 0.4, f.y + 0.5, h, 0.12, 0.22, '#f5f3ee', '#6b5a48'));
  return parts;
}

export function couchParts(f: Furniture): Part[] {
  const c = f.color ?? '#5b6573';
  const back = 0.35;
  const arm = 0.32;
  const facing = f.facing ?? 's';
  const alongX = facing === 'n' || facing === 's';
  const backBox: Box3 = alongX
    ? { x: f.x, y: facing === 'n' ? f.y : f.y + f.d - back, z: 0, w: f.w, d: back, h: 1.6 }
    : { x: facing === 'e' ? f.x : f.x + f.w - back, y: f.y, z: 0, w: back, d: f.d, h: 1.6 };
  const seat: Box3 = alongX
    ? { x: f.x + arm, y: facing === 'n' ? f.y + back : f.y, z: 0, w: f.w - arm * 2, d: f.d - back, h: 0.85 }
    : { x: facing === 'e' ? f.x + back : f.x, y: f.y + arm, z: 0, w: f.w - back, d: f.d - arm * 2, h: 0.85 };
  const arms: Box3[] = alongX
    ? [{ ...seat, x: f.x, w: arm, h: 1.15 }, { ...seat, x: f.x + f.w - arm, w: arm, h: 1.15 }]
    : [{ ...seat, y: f.y, d: arm, h: 1.15 }, { ...seat, y: f.y + f.d - arm, d: arm, h: 1.15 }];
  const half = alongX ? seat.x + seat.w / 2 : seat.y + seat.d / 2;
  const seam = alongX
    ? [[{ x: half, y: seat.y, z: 0.85 }, { x: half, y: seat.y + seat.d, z: 0.85 }]]
    : [[{ x: seat.x, y: half, z: 0.85 }, { x: seat.x + seat.w, y: half, z: 0.85 }]];
  return [
    box(`${f.id}.back`, backBox, c, shade(c, 0.12)),
    box(`${f.id}.seat`, seat, c, shade(c, 0.2), { decals: [{ kind: 'lines', segments: seam as never, stroke: shade(c, -0.25), width: 0.6 }] }),
    box(`${f.id}.arm1`, arms[0], shade(c, -0.03), shade(c, 0.15)),
    box(`${f.id}.arm2`, arms[1], shade(c, -0.03), shade(c, 0.15)),
  ];
}

export function cabinetParts(f: Furniture): Part[] {
  const h = f.h ?? 2;
  const c = f.color ?? '#9da3aa';
  const drawers = Math.max(2, Math.round(h / 0.55));
  const lines = [f.x, f.x + f.w].flatMap((x) => Array.from({ length: drawers - 1 }, (_, i) => {
    const z = ((i + 1) * h) / drawers;
    return [{ x, y: f.y + 0.05, z }, { x, y: f.y + f.d - 0.05, z }] as [never, never];
  }));
  const front = Array.from({ length: drawers - 1 }, (_, i) => {
    const z = ((i + 1) * h) / drawers;
    return [{ x: f.x + 0.05, y: f.y, z }, { x: f.x + f.w - 0.05, y: f.y, z }] as [never, never];
  });
  return [box(`${f.id}.body`, fb(f, h), c, shade(c, 0.25), { decals: [{ kind: 'lines', segments: [...lines, ...front], stroke: shade(c, -0.3), width: 0.5 }] })];
}

const BOOKS = ['#a33b32', '#2f5c8a', '#d9a441', '#3f7a3c', '#6b4a7a', '#c8734a'];
const BINDERS = ['#2f5c8a', '#f4f2ee', '#3d7fb8', '#e8e2d0', '#1f4f7a', '#d9a441', '#f4f2ee'];

/** Shelves of books (or binders) on the face the shelf faces: x-min for 'w' (default), x-max for 'e', y-min for 's'. */
export function bookshelfParts(f: Furniture, binders = false): Part[] {
  const h = f.h ?? (binders ? 1.3 : 3);
  const palette = binders ? BINDERS : BOOKS;
  const { plane, at, u0, len } = facingFace(f, f.facing ?? 'w');
  const shelves = Math.max(1, Math.round(h / 0.75));
  const slot = (len - 0.3) / palette.length;
  const decals = Array.from({ length: shelves }, (_, s) => {
    const z0 = 0.15 + (s * (h - 0.3)) / shelves;
    return palette.map((color, i) => faceRect(plane, at, u0 + 0.15 + i * slot, u0 + 0.1 + (i + 1) * slot,
      z0 + 0.05, z0 + Math.min(0.45, (h - 0.3) / shelves - 0.08) - (i % 3) * 0.05, color));
  }).flat();
  const wood = f.color ?? (binders ? '#e3ddd0' : '#8a6240');
  const body = box(`${f.id}.body`, fb(f, h), wood, shade(wood, 0.2), { decals });
  return binders && h <= 1.6 ? [body, ...shelfTop(f, h)] : [body];
}

const TOP_BINDERS = ['#c0392b', '#2f5c8a', '#f4f2ee', '#3f7a3c', '#d9a441'];

/** A low shelf's top: binders standing in a row at one end, a stack of paper at the other (what the camera sees most). */
function shelfTop(f: Furniture, h: number): Part[] {
  const alongX = f.w >= f.d;
  const len = alongX ? f.w : f.d;
  const v0 = (alongX ? f.d : f.w) / 2 - 0.25;
  const at = (u: number, w: number, d: number, z: number, hh: number): Box3 => (alongX
    ? { x: f.x + u, y: f.y + v0, z, w, d, h: hh }
    : { x: f.x + v0, y: f.y + u, z, w: d, d: w, h: hh });
  const n = Math.min(5, Math.max(2, Math.floor((len - 0.9) / 0.16)));
  const row = Array.from({ length: n }, (_, i) => {
    const c = TOP_BINDERS[(i + Math.round(f.x + f.y)) % TOP_BINDERS.length];
    return box(`${f.id}.top-binder${i}`, at(0.15 + i * 0.16, 0.13, 0.5, h, 0.42), c, shade(c, 0.15));
  });
  return [...row, box(`${f.id}.top-paper`, at(len - 0.7, 0.55, 0.45, h, 0.12), '#e9e6de', PAL.paper)];
}

export function plantParts(f: Furniture): Part[] {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.d / 2;
  const r = Math.min(f.w, f.d) / 2;
  const h = f.h ?? 1.8;
  return [
    cyl(`${f.id}.pot`, cx, cy, 0, r * 0.62, 0.55, '#e9e4da', '#5b4636'),
    blob(`${f.id}.l1`, cx - r * 0.25, cy + r * 0.2, h * 0.55, r * 0.7, PAL.plantDark),
    blob(`${f.id}.l2`, cx + r * 0.25, cy - r * 0.15, h * 0.62, r * 0.68, PAL.plant),
    blob(`${f.id}.l3`, cx, cy, h * 0.82, r * 0.6, PAL.plantLight),
  ];
}

export function binParts(f: Furniture): Part[] {
  const side = f.color ?? '#6d7279';
  return [cyl(`${f.id}.bin`, f.x + f.w / 2, f.y + f.d / 2, 0, Math.min(f.w, f.d) / 2, f.h ?? 0.9, side, f.color ? shade(side, -0.3) : '#2d3035')];
}

export function copierParts(f: Furniture): Part[] {
  const h = f.h ?? 2;
  return [
    box(`${f.id}.body`, fb(f, h - 0.25), '#d5d8dc', '#eceef0', {
      decals: [{ kind: 'lines', segments: [[{ x: f.x + 0.1, y: f.y, z: 0.5 }, { x: f.x + f.w - 0.1, y: f.y, z: 0.5 }], [{ x: f.x + 0.1, y: f.y, z: 0.95 }, { x: f.x + f.w - 0.1, y: f.y, z: 0.95 }]], stroke: '#9ea3a9', width: 0.6 }],
    }),
    box(`${f.id}.lid`, { x: f.x + 0.1, y: f.y + 0.1, z: h - 0.25, w: f.w - 0.2, d: f.d - 0.2, h: 0.25 }, '#bfc3c8', '#dfe2e5', {
      decals: [{ kind: 'poly', fill: '#3a7bd5', points: [{ x: f.x + 0.2, y: f.y + 0.15, z: h }, { x: f.x + 0.75, y: f.y + 0.15, z: h }, { x: f.x + 0.75, y: f.y + 0.45, z: h }, { x: f.x + 0.2, y: f.y + 0.45, z: h }] }],
    }),
  ];
}

export function itCartParts(f: Furniture): Part[] {
  const h = f.h ?? 1.5;
  const leg = (id: string, x: number, y: number) => box(`${f.id}.${id}`, { x, y, z: 0, w: 0.08, d: 0.08, h: h - 0.06 }, '#5b6068');
  return [
    leg('l1', f.x + 0.05, f.y + 0.05), leg('l2', f.x + f.w - 0.13, f.y + 0.05), leg('l3', f.x + 0.05, f.y + f.d - 0.13), leg('l4', f.x + f.w - 0.13, f.y + f.d - 0.13),
    box(`${f.id}.shelf`, { x: f.x + 0.05, y: f.y + 0.05, z: 0.35, w: f.w - 0.1, d: f.d - 0.1, h: 0.05 }, '#6b7078', '#868b93'),
    box(`${f.id}.box`, { x: f.x + 0.2, y: f.y + 0.2, z: 0.4, w: 0.6, d: 0.5, h: 0.35 }, PAL.cardboard),
    box(`${f.id}.top`, { x: f.x, y: f.y, z: h - 0.06, w: f.w, d: f.d, h: 0.06 }, '#4a4f57', '#5d636c'),
    box(`${f.id}.laptop`, { x: f.x + 0.25, y: f.y + 0.2, z: h, w: 0.8, d: 0.55, h: 0.04 }, '#9aa1aa', '#c9ced4'),
    box(`${f.id}.lid`, { x: f.x + 0.25, y: f.y + 0.75, z: h + 0.04, w: 0.8, d: 0.05, h: 0.5 }, '#7d848d', '#a9afb7'),
  ];
}

export function waterCoolerParts(f: Furniture): Part[] {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.d / 2;
  return [
    box(`${f.id}.base`, fb(f, 1.5), '#e9ebee', '#f6f7f8', { decals: [faceRect('y', f.y, f.x + 0.25, f.x + 0.45, 1.05, 1.2, '#3a7bd5'), faceRect('y', f.y, f.x + 0.5, f.x + 0.7, 1.05, 1.2, '#d64545')] }),
    { ...cyl(`${f.id}.bottle`, cx, cy, 1.5, 0.32, 0.85, '#7fc4e8', '#a9dcf3'), opacity: 0.85 },
  ];
}

export function whiteboardParts(f: Furniture): Part[] {
  const z = f.z ?? 0.8;
  const h = f.h ?? 1.6;
  const ink = (pts: [number, number][]) => pts.slice(1).map((p, i) => [
    { x: f.x, y: f.y + pts[i][0], z: z + pts[i][1] }, { x: f.x, y: f.y + p[0], z: z + p[1] },
  ] as [never, never]);
  return [box(`${f.id}.board`, { x: f.x, y: f.y, z, w: f.w, d: f.d, h }, '#fbfbf9', '#c9ccd1', {
    stroke: '#9ea3a9',
    decals: [
      { kind: 'lines', segments: ink([[0.4, 0.4], [1.2, 0.8], [1.9, 0.6], [2.7, 1.2], [3.4, 1.0]]), stroke: '#3a7bd5', width: 0.9 },
      { kind: 'lines', segments: ink([[0.4, 1.3], [1.6, 1.3]]), stroke: '#d64545', width: 0.9 },
      { kind: 'lines', segments: ink([[2.2, 0.3], [3.6, 0.3]]), stroke: '#2fa84f', width: 0.9 },
    ],
  })];
}

export function tvParts(f: Furniture): Part[] {
  const z = f.z ?? 1;
  const h = f.h ?? 1.4;
  return [box(`${f.id}.tv`, { x: f.x, y: f.y, z, w: f.w, d: f.d, h }, '#22262c', '#33383f', {
    decals: [faceRect('x', f.x, f.y + 0.1, f.y + f.d - 0.1, z + 0.1, z + h - 0.1, '#2c4a6e'), faceRect('x', f.x, f.y + 0.3, f.y + 1.2, z + 0.7, z + 1.05, '#4f86c6', 0.7)],
  })];
}

export function ledgeParts(f: Furniture): Part[] {
  const h = f.h ?? 1.9;
  return [
    box(`${f.id}.front`, fb(f, h - 0.1), '#8f6a48', undefined, {
      decals: [faceRect('x', f.x, f.y + 0.3, f.y + f.d - 0.3, 0.7, 1.2, '#2f5d9a')],
    }),
    box(`${f.id}.cap`, { x: f.x, y: f.y, z: h - 0.1, w: f.w, d: f.d, h: 0.1 }, '#d9cdb8', '#efe6d6'),
  ];
}

export function rugDecal(f: Furniture) {
  return flatRect(f.x, f.y, f.w, f.d, 0.01, f.color ?? '#b49a74');
}
