import { describe, expect, it } from 'vitest';
import { FURNITURE, type Furniture, SEATS } from '@shared/office';
import { furnitureParts } from './furnitureParts';
import { type Decal, type Part, arc, partBox } from './parts';
import { seatParts } from './chairParts';

const item = (kind: Furniture['kind'], extra: Partial<Furniture> = {}): Furniture => ({
  id: `t.${kind}`, kind, areaId: 'bullpen', x: 10, y: 20, w: 3, d: 2, ...extra,
});
const decals = (parts: Part[]): Decal[] => parts.flatMap((p) => p.decals ?? []);
const inside = (f: Furniture, p: Part) => {
  const b = partBox(p);
  return b.x >= f.x - 0.01 && b.x + b.w <= f.x + f.w + 0.01 && b.y >= f.y - 0.01 && b.y + b.d <= f.y + f.d + 0.01;
};

const FLAT = new Set(['rug', 'mat', 'floor-mark']);

describe('furnitureParts', () => {
  it('gives every solid furniture item something to draw', () => {
    const empty = FURNITURE.filter((f) => !FLAT.has(f.kind) && furnitureParts(f).length === 0).map((f) => f.id);
    expect(empty).toEqual([]);
  });

  it('gives parts unique ids within an item', () => {
    for (const f of FURNITURE) {
      const ids = furnitureParts(f).map((p) => p.id);
      expect(new Set(ids).size, f.id).toBe(ids.length);
    }
  });

  it('draws the desk top after the pedestal and the monitor after the top', () => {
    const desk = FURNITURE.find((f) => f.id === 'bp.desk.dwight')!;
    const ids = furnitureParts(desk).map((p) => p.id.split('.').pop());
    expect(ids.indexOf('pedestal')).toBeLessThan(ids.indexOf('top'));
    expect(ids.indexOf('top')).toBeLessThan(ids.indexOf('monitor'));
  });

  it('keeps desk parts inside the desk footprint', () => {
    for (const f of FURNITURE.filter((x) => x.kind === 'desk')) {
      for (const p of furnitureParts(f)) {
        const b = partBox(p);
        expect(b.x >= f.x - 0.01 && b.x + b.w <= f.x + f.w + 0.01 && b.y >= f.y - 0.01 && b.y + b.d <= f.y + f.d + 0.01, `${f.id}/${p.id}`).toBe(true);
      }
    }
  });
});

describe('reference furniture', () => {
  it('bounds an arc part by the ring sector it sweeps', () => {
    const b = partBox(arc('a', 0, 0, 0, 1, 2, 90, 180, 1.5, '#b98a5a'));
    expect(b.x).toBeCloseTo(-2);
    expect(b.y).toBeCloseTo(0);
    expect(b.x + b.w).toBeCloseTo(0);
    expect(b.y + b.d).toBeCloseTo(2);
    expect(b.h).toBe(1.5);
  });

  it('builds the curved reception desk from arcs (desk and frosted ledge) inside its footprint', () => {
    const f = item('reception-desk', { w: 2.8, d: 5.2, facing: 'w' });
    const parts = furnitureParts(f);
    expect(parts.filter((p) => p.shape === 'arc').length).toBeGreaterThanOrEqual(2);
    for (const p of parts) expect(inside(f, p), p.id).toBe(true);
  });

  it('writes a wall sign’s label on the face toward the camera', () => {
    const f = item('wall-sign', { d: 0.2, z: 1, h: 1.3, label: 'DUNDER MIFFLIN', facing: 's' });
    const texts = decals(furnitureParts(f)).filter((d) => d.kind === 'text');
    expect(texts.map((t) => (t.kind === 'text' ? t.text : '')).join(' ')).toBe('DUNDER MIFFLIN');
    expect(texts.every((t) => t.kind === 'text' && t.axis === 'x' && t.at.y === f.y)).toBe(true);
  });

  it('puts books on the face a shelf faces', () => {
    const south = decals(furnitureParts(item('bookshelf', { facing: 's' }))).filter((d) => d.kind === 'poly');
    expect(south.length).toBeGreaterThan(0);
    expect(south.every((d) => d.kind === 'poly' && d.points.every((pt) => pt.y === 20))).toBe(true);
    const west = decals(furnitureParts(item('binder-shelf'))).filter((d) => d.kind === 'poly');
    expect(west.every((d) => d.kind === 'poly' && d.points.every((pt) => pt.x === 10))).toBe(true);
  });

  it('puts shelf contents, cork boards and screens on an east face when they face east (seen from the camera’s right)', () => {
    const onEast = (f: Furniture) => decals(furnitureParts(f)).filter((d) => d.kind === 'poly')
      .every((d) => d.kind === 'poly' && d.points.every((pt) => Math.abs(pt.x - (f.x + f.w)) < 1e-9));
    for (const kind of ['bookshelf', 'binder-shelf', 'supply-shelf'] as const) {
      const f = item(kind, { facing: 'e', w: 1, d: 3 });
      expect(decals(furnitureParts(f)).length, kind).toBeGreaterThan(0);
      expect(onEast(f), kind).toBe(true);
    }
    expect(onEast(item('bulletin', { facing: 'e', w: 0.2, d: 3, z: 0.9, h: 1.4 }))).toBe(true);
    const tv = item('tv-stand', { facing: 'e', w: 0.8, d: 3.8, h: 2.4 });
    const screen = decals(furnitureParts(tv)).filter((d) => d.kind === 'poly');
    expect(screen.length).toBe(1);
    const desk = item('desk', { facing: 'w', w: 1.6, d: 3.2, items: ['monitor'] });
    const monitor = furnitureParts(desk).find((p) => p.id.endsWith('.monitor'))!;
    const mb = partBox(monitor);
    expect(monitor.decals?.[0]?.kind === 'poly' && monitor.decals[0].points.every((pt) => Math.abs(pt.x - (mb.x + mb.w)) < 1e-9)).toBe(true);
  });

  it('raises stairs facing n toward the back: steps climb with y onto a landing, each riser facing the camera', () => {
    const f = item('stairs', { color: '#8a3a40', facing: 'n', w: 5, d: 8, h: 2.4 });
    const parts = furnitureParts(f);
    const steps = parts.filter((p) => /\.step\d+$/.test(p.id)).map(partBox).sort((a, b) => a.y - b.y);
    expect(steps.length).toBeGreaterThanOrEqual(6);
    const tops = steps.map((b) => b.z + b.h);
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    expect(new Set(tops).size).toBe(tops.length);
    const landing = partBox(parts.find((p) => p.id.endsWith('.landing'))!);
    expect(landing.y).toBeCloseTo(steps[steps.length - 1].y + steps[steps.length - 1].d, 6);
    expect(landing.y + landing.d).toBeCloseTo(f.y + f.d, 6);
    expect(landing.z + landing.h).toBeCloseTo(2.4, 6);
    expect(tops[tops.length - 1]).toBeLessThan(2.4 + 1e-9);
    for (const p of parts) expect(inside(f, p), p.id).toBe(true);
  });

  it('shows stairs going down a well only through its opening', () => {
    const well = furnitureParts(item('stairs', { color: '#8a3a40', facing: 's' })).find((p) => p.id.endsWith('.well'))!;
    expect(well.shape === 'box' && well.clipDecals).toBe('top');
  });

  it('draws framed pictures, the stair half-wall with a handrail, and white wall cabinets with doors', () => {
    const pic = item('picture', { x: 10, w: 0.2, d: 1.2, z: 1.3, h: 0.9, facing: 'w', color: '#5d7f9e' });
    const picDecals = decals(furnitureParts(pic)).filter((d) => d.kind === 'poly');
    expect(picDecals.length).toBeGreaterThanOrEqual(2);
    expect(picDecals.every((d) => d.kind === 'poly' && d.points.every((p) => p.x === 10))).toBe(true);
    const wall = item('balustrade', { w: 0.35, d: 5, h: 1.3 });
    const wallParts = furnitureParts(wall);
    expect(wallParts.map((p) => p.id)).toEqual(expect.arrayContaining(['t.balustrade.wall', 't.balustrade.cap', 't.balustrade.rail']));
    const uppers = item('wall-cabinets', { w: 6, d: 0.7, z: 2.55, h: 0.95 });
    const upperParts = furnitureParts(uppers);
    const seams = decals(upperParts).filter((d) => d.kind === 'lines');
    expect(seams.length).toBeGreaterThan(0);
    for (const kind of ['picture', 'balustrade', 'wall-cabinets'] as const) {
      const f = kind === 'picture' ? pic : kind === 'balustrade' ? wall : uppers;
      for (const p of furnitureParts(f)) expect(inside(f, p), `${kind}/${p.id}`).toBe(true);
    }
  });

  it('builds the elevator as an open brushed-steel car: floor, walls, handrail, door jambs and doors on the hallway side', () => {
    const f = item('elevator', { x: 1.2, y: 19.7, w: 5.6, d: 6.1, h: 2.7, facing: 'n' });
    const parts = furnitureParts(f);
    const ids = parts.map((p) => p.id.replace('t.elevator.', ''));
    expect(ids).toEqual(expect.arrayContaining(['floor', 'wall-left', 'wall-right', 'wall-front', 'rail-left', 'jamb-left', 'jamb-right', 'header', 'doors', 'panel']));
    // the car sits at the back of a thick-walled beige shaft, like the render's
    expect(ids).toEqual(expect.arrayContaining(['shaft-left', 'shaft-right', 'shaft-front']));
    const car = partBox(parts.find((p) => p.id.endsWith('.floor'))!);
    expect(car.x - f.x).toBeGreaterThanOrEqual(0.5);
    expect(car.y - f.y).toBeGreaterThanOrEqual(1);
    for (const p of parts) expect(inside(f, p), p.id).toBe(true);
    const doors = partBox(parts.find((p) => p.id.endsWith('.doors'))!);
    expect(doors.y + doors.d).toBeCloseTo(f.y + f.d, 6);
    const floor = parts.find((p) => p.id.endsWith('.floor'))!;
    expect(floor.decals?.some((d) => d.kind === 'lines')).toBe(true); // brushed plate
    const steel = parts.filter((p) => p.id.includes('wall-')).map((p) => (p.shape === 'box' ? p.side : ''));
    expect(steel.every((c) => /^#[a-f0-9]{6}$/.test(c))).toBe(true);
    const inner = parts.find((p) => p.id.endsWith('.wall-left'))!;
    expect(inner.decals?.length ?? 0).toBeGreaterThan(0); // brushed streaks on the inner face
  });

  it('carpets the stairs in the given colour', () => {
    const fills = decals(furnitureParts(item('stairs', { color: '#8a2f35', facing: 's' }))).map((d) => (d.kind === 'poly' ? d.fill : ''));
    expect(fills.some((c) => c.startsWith('#8') || c.startsWith('#9') || c.startsWith('#7'))).toBe(true);
    expect(fills).not.toContain('#c9c2b6');
  });

  it('draws partitions, bulletin boards, supply shelves and a TV stand inside their footprint', () => {
    for (const kind of ['partition', 'bulletin', 'supplies', 'tv-stand'] as const) {
      const f = item(kind, kind === 'bulletin' ? { w: 0.2, d: 3, z: 0.9, h: 1.4 } : {});
      const parts = furnitureParts(f);
      expect(parts.length, kind).toBeGreaterThan(0);
      for (const p of parts) expect(inside(f, p), `${kind}/${p.id}`).toBe(true);
    }
  });
});

describe('seatParts', () => {
  it('puts the chair back in front of a person facing away from the camera', () => {
    const phyllis = SEATS.find((s) => s.id === 'seat.phyllis')!;
    expect(seatParts(phyllis).front.map((p) => p.id)).toEqual(['seat.phyllis.back']);
    const jim = SEATS.find((s) => s.id === 'seat.jim')!;
    expect(seatParts(jim).front).toEqual([]);
  });

  it('draws nothing for a place to stand (no chair)', () => {
    const spot = { id: 'spot.coffee.1', areaId: 'kitchen', x: 42.5, y: 20.2, facing: 'n' as const, kind: 'spot' as const, chair: 'none' as const };
    expect(seatParts(spot)).toEqual({ behind: [], front: [] });
  });
});
