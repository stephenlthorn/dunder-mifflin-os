// Kitchen, break room, restroom and warehouse furniture.
import type { Furniture } from '@shared/office';
import { shade } from '../../iso/color';
import type { Box3, Vec3 } from '../../iso/projection';
import { PAL } from '../palette';
import { type Part, blob, box, cyl, faceRect } from './parts';

const fb = (f: Furniture, h: number, z = 0): Box3 => ({ x: f.x, y: f.y, z: f.z ?? z, w: f.w, d: f.d, h });

export function counterParts(f: Furniture): Part[] {
  const h = f.h ?? 1.8;
  const doors = Math.floor(f.w / 1.2);
  const seams = Array.from({ length: doors }, (_, i) => [
    { x: f.x + (i + 1) * 1.2, y: f.y, z: 0.1 }, { x: f.x + (i + 1) * 1.2, y: f.y, z: h - 0.25 },
  ] as [Vec3, Vec3]);
  const parts: Part[] = [
    box(`${f.id}.base`, fb(f, h - 0.12), '#efe9dc', undefined, { decals: [{ kind: 'lines', segments: seams, stroke: '#cfc6b3', width: 0.6 }] }),
    box(`${f.id}.top`, { x: f.x, y: f.y - 0.05, z: h - 0.12, w: f.w, d: f.d + 0.05, h: 0.12 }, '#5d6066', '#74787f'),
  ];
  const slot = (i: number) => f.x + 0.4 + i * 1.8;
  (f.items ?? []).forEach((item, i) => {
    const x = slot(i);
    if (item === 'sink') parts.push(box(`${f.id}.sink`, { x, y: f.y + 0.2, z: h - 0.01, w: 1.1, d: 0.75, h: 0.02 }, '#9ea4ab', '#c3c8cd'));
    if (item === 'coffee') parts.push(box(`${f.id}.coffee`, { x, y: f.y + 0.35, z: h, w: 0.6, d: 0.55, h: 0.75 }, '#2d3035', '#40444a', {
      decals: [faceRect('y', f.y + 0.35, x + 0.15, x + 0.3, 0.35 + h, 0.45 + h, '#e04b4b')],
    }));
    if (item === 'microwave') parts.push(box(`${f.id}.microwave`, { x, y: f.y + 0.2, z: h, w: 1.1, d: 0.75, h: 0.6 }, '#d9dcdf', '#eceef0', {
      decals: [faceRect('y', f.y + 0.2, x + 0.1, x + 0.75, h + 0.1, h + 0.5, '#2b2f36')],
    }));
    if (item === 'toaster') parts.push(box(`${f.id}.toaster`, { x, y: f.y + 0.35, z: h, w: 0.7, d: 0.45, h: 0.4 }, '#c94b3f', '#d96a5f'));
  });
  return parts;
}

export function fridgeParts(f: Furniture): Part[] {
  const h = f.h ?? 3.6;
  return [box(`${f.id}.body`, fb(f, h), '#eef0f2', '#f8f9fa', {
    decals: [
      { kind: 'lines', segments: [[{ x: f.x, y: f.y, z: h * 0.62 }, { x: f.x + f.w, y: f.y, z: h * 0.62 }]], stroke: '#b9bec4', width: 0.7 },
      faceRect('y', f.y, f.x + f.w - 0.25, f.x + f.w - 0.18, h * 0.68, h * 0.9, '#9aa0a8'),
      faceRect('y', f.y, f.x + f.w - 0.25, f.x + f.w - 0.18, h * 0.3, h * 0.55, '#9aa0a8'),
      faceRect('y', f.y, f.x + 0.3, f.x + 0.6, h * 0.75, h * 0.83, '#f2c230'),
    ],
  })];
}

export function vendingParts(f: Furniture): Part[] {
  const h = f.h ?? 3.6;
  const c = f.color ?? '#c0392b';
  const snacks = ['#f2c230', '#e04b4b', '#2fa84f', '#3a7bd5', '#f08a24'];
  const rows = [0.75, 0.6, 0.45, 0.3].map((r, ri) => snacks.map((s, i) =>
    faceRect('y', f.y, f.x + 0.25 + i * 0.22, f.x + 0.38 + i * 0.22, h * r, h * r + 0.22, snacks[(i + ri) % snacks.length] ?? s)));
  return [box(`${f.id}.body`, fb(f, h), c, shade(c, 0.2), {
    decals: [
      faceRect('y', f.y, f.x + 0.15, f.x + 1.35, h * 0.22, h * 0.92, '#e8f3f7', 0.92),
      ...rows.flat(),
      faceRect('y', f.y, f.x + 1.5, f.x + 1.8, h * 0.5, h * 0.62, '#2b2f36'),
      faceRect('y', f.y, f.x + 0.3, f.x + 1.2, h * 0.06, h * 0.14, '#2b2f36'),
    ],
  })];
}

export function toiletParts(f: Furniture): Part[] {
  const cx = f.x + f.w / 2;
  return [
    box(`${f.id}.tank`, { x: f.x + 0.1, y: f.y + f.d - 0.35, z: 0, w: f.w - 0.2, d: 0.35, h: 1.2 }, '#eef0f2', '#ffffff'),
    cyl(`${f.id}.bowl`, cx, f.y + 0.45, 0, 0.4, 0.7, '#e8eaed', '#f7f8f9'),
  ];
}

export function vanityParts(f: Furniture): Part[] {
  const h = f.h ?? 1.5;
  const cx = f.x + f.w / 2;
  const cy = f.y + f.d / 2;
  return [
    box(`${f.id}.cab`, fb(f, h), '#d8cfc0', '#f1efe9'),
    cyl(`${f.id}.basin`, cx, cy, h, 0.28, 0.03, '#c9d3da', '#dfe7ec'),
    box(`${f.id}.tap`, { x: f.x + f.w - 0.2, y: cy - 0.04, z: h, w: 0.08, d: 0.08, h: 0.25 }, '#9aa0a8'),
  ];
}

export function kettlebellParts(f: Furniture): Part[] {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.d / 2;
  return [blob(`${f.id}.bell`, cx, cy, 0.3, 0.3, '#2d3035'), box(`${f.id}.handle`, { x: cx - 0.15, y: cy - 0.03, z: 0.55, w: 0.3, d: 0.06, h: 0.15 }, '#2d3035')];
}

export function shelvingParts(f: Furniture): Part[] {
  const h = f.h ?? 3;
  const bays = Math.max(1, Math.round(f.w / 3.6));
  const bay = f.w / bays;
  const levels = [0.15, h * 0.42, h * 0.78];
  const parts: Part[] = [];
  for (let b = 0; b <= bays; b += 1) {
    const x = Math.min(f.x + b * bay, f.x + f.w - 0.12);
    parts.push(box(`${f.id}.u${b}a`, { x, y: f.y, z: 0, w: 0.12, d: 0.12, h }, '#d9822b'));
    parts.push(box(`${f.id}.u${b}b`, { x, y: f.y + f.d - 0.12, z: 0, w: 0.12, d: 0.12, h }, '#d9822b'));
  }
  levels.forEach((z, li) => {
    parts.push(box(`${f.id}.deck${li}`, { x: f.x, y: f.y + 0.12, z, w: f.w, d: f.d - 0.24, h: 0.08 }, '#2f5c8a', '#a9aeb5'));
    for (let b = 0; b < bays; b += 1) {
      const x0 = f.x + b * bay + 0.25;
      const sizes = [[0.9, 0.7], [1.1, 0.55], [0.8, 0.8]];
      let cursor = x0;
      sizes.forEach(([w, bh], si) => {
        if (cursor + w > f.x + (b + 1) * bay - 0.2 || (li + b + si) % 4 === 3) { cursor += w + 0.1; return; }
        parts.push(box(`${f.id}.c${li}.${b}.${si}`, { x: cursor, y: f.y + 0.2, z: z + 0.08, w, d: f.d - 0.4, h: bh }, PAL.cardboard, '#d8b483', {
          decals: [{ kind: 'lines', segments: [[{ x: cursor + w / 2, y: f.y + 0.2, z: z + 0.08 + bh }, { x: cursor + w / 2, y: f.y + f.d - 0.2, z: z + 0.08 + bh }]], stroke: '#b08a55', width: 0.6 }],
        }));
        cursor += w + 0.1;
      });
    }
  });
  return parts;
}

export function cratesParts(f: Furniture): Part[] {
  const h = f.h ?? 1.2;
  const pallet = box(`${f.id}.pallet`, fb(f, 0.18), '#b08657', '#c69c6a');
  const layers = Math.max(1, Math.round((h - 0.18) / 0.55));
  const lh = (h - 0.18) / layers;
  const stack = Array.from({ length: layers }, (_, i) => box(`${f.id}.b${i}`, {
    x: f.x + 0.06, y: f.y + 0.06, z: 0.18 + i * lh, w: f.w - 0.12, d: f.d - 0.12, h: lh - 0.02,
  }, PAL.cardboard, '#d8b483', {
    decals: [{ kind: 'lines', segments: [[{ x: f.x + f.w / 2, y: f.y + 0.06, z: 0.18 + (i + 1) * lh - 0.02 }, { x: f.x + f.w / 2, y: f.y + f.d - 0.06, z: 0.18 + (i + 1) * lh - 0.02 }]], stroke: '#a77d4a', width: 0.7 }],
  }));
  return [pallet, ...stack];
}

export function palletParts(f: Furniture): Part[] {
  return [box(`${f.id}.pallet`, fb(f, f.h ?? 0.3), '#b08657', '#c69c6a', {
    decals: [0.25, 0.5, 0.75].map((t) => flatRectLine(f, t)),
  })];
}

const flatRectLine = (f: Furniture, t: number) => ({
  kind: 'lines' as const, stroke: '#8f6a40', width: 0.6,
  segments: [[{ x: f.x, y: f.y + f.d * t, z: f.h ?? 0.3 }, { x: f.x + f.w, y: f.y + f.d * t, z: f.h ?? 0.3 }]] as [Vec3, Vec3][],
});
