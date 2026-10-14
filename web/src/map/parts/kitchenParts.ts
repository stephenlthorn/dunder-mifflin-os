// Kitchen cabinetry: the white wall cabinets that hang over the counter run.
import type { Furniture } from '@shared/office';
import type { Vec3 } from '../../iso/projection';
import { type Part, box } from './parts';

/** White upper cabinets: door seams and small handles on the front (y-min) face. */
export function wallCabinetsParts(f: Furniture): Part[] {
  const z = f.z ?? 2.5;
  const h = f.h ?? 0.95;
  const doors = Math.max(1, Math.round(f.w / 0.9));
  const dw = f.w / doors;
  const seams = Array.from({ length: doors - 1 }, (_, i): [Vec3, Vec3] => [
    { x: f.x + (i + 1) * dw, y: f.y, z: z + 0.05 }, { x: f.x + (i + 1) * dw, y: f.y, z: z + h - 0.05 },
  ]);
  const handles = Array.from({ length: doors }, (_, i): [Vec3, Vec3] => {
    const x = f.x + i * dw + (i % 2 ? 0.14 : dw - 0.14);
    return [{ x, y: f.y, z: z + 0.1 }, { x, y: f.y, z: z + 0.32 }];
  });
  return [box(`${f.id}.body`, { x: f.x, y: f.y, z, w: f.w, d: f.d, h }, '#f4f1ea', '#fbfaf6', {
    stroke: 'rgba(120,110,95,0.35)',
    decals: [
      { kind: 'lines', segments: seams, stroke: '#cfc8ba', width: 0.6 },
      { kind: 'lines', segments: handles, stroke: '#8e9399', width: 0.9 },
    ],
  })];
}
