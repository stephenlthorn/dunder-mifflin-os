import { describe, expect, it } from 'vitest';
import type { DeskItem, Furniture } from '@shared/office';
import type { Box3 } from '../../iso/projection';
import { furnitureParts } from './furnitureParts';
import { type Decal, type Part, partBox } from './parts';

const desk = (facing: Furniture['facing'], items: Furniture['items'], extra: Partial<Furniture> = {}): Furniture => {
  const deep = facing === 'e' || facing === 'w';
  return { id: 't.desk', kind: 'desk', areaId: 'bullpen', x: 10, y: 20, w: deep ? 1.6 : 3.2, d: deep ? 3.2 : 1.6, facing, items, ...extra };
};
const overlap = (a: Box3, b: Box3) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.d - 1e-6 && b.y < a.y + a.d - 1e-6;
const union = (bs: Box3[]): Box3 => {
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  return { x, y, z: 0, w: Math.max(...bs.map((b) => b.x + b.w)) - x, d: Math.max(...bs.map((b) => b.y + b.d)) - y, h: 1 };
};
/** Plan footprints of the things on a desk: one per item slot, plus the monitor/laptop and keyboard. */
function footprints(parts: Part[]): Map<string, Box3> {
  const groups = new Map<string, Box3[]>();
  for (const p of parts) {
    const rest = p.id.slice('t.desk.'.length);
    const key = /^\d+\./.test(rest) ? rest.split('.')[0] : rest;
    if (['top', 'pedestal', 'panel', 'leg'].includes(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), partBox(p)]);
  }
  return new Map([...groups].map(([k, bs]) => [k, union(bs)]));
}

const CLUTTER: DeskItem[] = ['papers', 'tray', 'mug', 'binders', 'lamp', 'folders'];

describe('desk clutter', () => {
  it('draws in/out trays, upright binders, folders and pen cups on the desk top', () => {
    for (const item of ['tray', 'binders', 'folders', 'pencup'] as const) {
      const parts = furnitureParts(desk('s', [item]));
      const mine = parts.filter((p) => p.id.startsWith('t.desk.0.'));
      expect(mine.length, item).toBeGreaterThan(0);
      expect(mine.every((p) => partBox(p).z >= 1.5 - 1e-6), item).toBe(true);
    }
  });

  it('fits six things on a deep desk without overlapping each other, the monitor or the keyboard', () => {
    for (const facing of ['n', 'e', 's', 'w'] as const) {
      const f = desk(facing, ['monitor', ...CLUTTER]);
      const spots = footprints(furnitureParts(f));
      expect([...spots.keys()].filter((k) => /^\d+$/.test(k)), facing).toHaveLength(6);
      const all = [...spots];
      all.forEach(([a, ba], i) => all.slice(i + 1).forEach(([b, bb]) => {
        expect(overlap(ba, bb), `${facing}: ${a} × ${b}`).toBe(false);
      }));
    }
  });

  it('names the parts the delight layer animates or clicks: the bobblehead\'s head and the boss mug', () => {
    const named = (item: DeskItem) => furnitureParts(desk('w', [item])).flatMap((p) => (p.className ? [p.className] : []));
    expect(named('bobblehead')).toEqual(['bobble-head']);
    expect(named('boss-mug')).toEqual(['boss-mug']);
    expect(named('mug')).toEqual([]);
  });

  it('keeps clutter on longer desks inside the footprint', () => {
    const f = desk('s', ['monitor', ...CLUTTER], { w: 4.8, d: 1.7 });
    for (const p of furnitureParts(f)) {
      const b = partBox(p);
      expect(b.x >= f.x - 0.01 && b.x + b.w <= f.x + f.w + 0.01 && b.y >= f.y - 0.01 && b.y + b.d <= f.y + f.d + 0.01, p.id).toBe(true);
    }
  });
});

describe('shelving clutter', () => {
  const shelf = (kind: Furniture['kind'], extra: Partial<Furniture> = {}): Furniture => ({
    id: `t.${kind}`, kind, areaId: 'reception', x: 10, y: 20, w: 2.4, d: 0.9, ...extra,
  });
  const decals = (parts: Part[]): Decal[] => parts.flatMap((p) => p.decals ?? []);

  it('draws a supply shelf with rows of coloured binders on the face toward the camera, inside its footprint', () => {
    const f = shelf('supply-shelf', { facing: 's', h: 2.2 });
    const parts = furnitureParts(f);
    const faces = decals(parts).filter((d) => d.kind === 'poly');
    expect(new Set(faces.map((d) => (d.kind === 'poly' ? d.fill : ''))).size).toBeGreaterThanOrEqual(4);
    expect(faces.every((d) => d.kind === 'poly' && d.points.every((pt) => pt.y === f.y))).toBe(true);
    for (const p of parts) {
      const b = partBox(p);
      expect(b.x >= f.x - 0.01 && b.x + b.w <= f.x + f.w + 0.01 && b.y >= f.y - 0.01 && b.y + b.d <= f.y + f.d + 0.01, p.id).toBe(true);
    }
  });

  it('stands binders on top of a low binder shelf, so the clutter shows from above', () => {
    const f = shelf('binder-shelf', { facing: 's', h: 1.3 });
    const onTop = furnitureParts(f).filter((p) => partBox(p).z >= 1.3 - 1e-6);
    expect(onTop.length).toBeGreaterThanOrEqual(3);
  });
});
