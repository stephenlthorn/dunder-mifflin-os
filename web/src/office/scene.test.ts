import { describe, expect, it } from 'vitest';
import { OFFICE } from '@shared/office';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { inFront, paintOrder } from '../iso/depth';
import { screenBounds } from '../iso/projection';
import { placePeople } from './placement';
import { buildScene, flatFurniture, seatBox } from './scene';

const placements = placePeople(DEMO_SNAPSHOT.people, DEMO_SNAPSHOT.presence, DEMO_SNAPSHOT.rooms, OFFICE.seats);
const scene = buildScene(OFFICE, placements);

describe('buildScene', () => {
  it('contains walls, furniture and every seat', () => {
    expect(scene.filter((d) => d.type === 'seat')).toHaveLength(OFFICE.seats.length);
    expect(scene.some((d) => d.type === 'wall')).toBe(true);
    expect(scene.some((d) => d.type === 'furniture')).toBe(true);
  });

  it('puts each placed person in exactly one seat', () => {
    const occupants = scene.flatMap((d) => (d.type === 'seat' && d.occupantId ? [d.occupantId] : []));
    expect(occupants.sort()).toEqual(DEMO_SNAPSHOT.people.map((p) => p.id).sort());
  });

  it('keeps flat things (rugs, mats, floor marks) out of the depth sort', () => {
    const flatIds = new Set(flatFurniture(OFFICE).map((f) => f.id));
    expect(flatIds.has('kit.doormat')).toBe(true);
    expect(scene.some((d) => flatIds.has(d.id))).toBe(false);
  });

  it('has no intersecting solid objects, so the painter’s sort is exact', () => {
    const clashes: string[] = [];
    for (let i = 0; i < scene.length; i += 1) {
      for (let j = i + 1; j < scene.length; j += 1) {
        if (inFront(scene[i].box, scene[j].box) === null) clashes.push(`${scene[i].id} × ${scene[j].id}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('seats the meeting pair in the front row of the Conference Room, facing the screen and drawn over the row behind', () => {
    const order = scene.map((d) => d.id);
    const seatOf = (id: string) => scene.find((d) => d.type === 'seat' && d.occupantId === id)!;
    expect([seatOf('michael').id, seatOf('angela').id]).toEqual(['seat.conf.s1', 'seat.conf.s2']);
    expect(OFFICE.seats.find((s) => s.id === 'seat.conf.s1')!.facing).toBe('w');
    const behind = scene.find((d) => d.id === 'seat.conf.n1')!; // the row behind, overlapping s2 on screen
    expect(inFront(scene.find((d) => d.id === 'seat.conf.s2')!.box, behind.box)).toBe(true);
    expect(order.indexOf('seat.conf.s2')).toBeGreaterThan(order.indexOf('seat.conf.n1'));
  });

  it('paints every pair that overlaps on screen back to front from the camera (walls left of it included)', () => {
    const wrong: string[] = [];
    scene.forEach((a, i) => scene.slice(i + 1).forEach((b) => {
      const [ra, rb] = [screenBounds(a.box), screenBounds(b.box)];
      const overlap = ra.minX < rb.maxX - 0.01 && rb.minX < ra.maxX - 0.01 && ra.minY < rb.maxY - 0.01 && rb.minY < ra.maxY - 0.01;
      if (overlap && paintOrder(a.box, b.box) === true) wrong.push(`${a.id} before ${b.id}`);
    }));
    expect(wrong).toEqual([]);
  });

  it('sizes a forklift seat to the whole forklift', () => {
    const roy = OFFICE.seats.find((s) => s.id === 'seat.roy')!;
    expect(seatBox(roy).w).toBeGreaterThan(3);
  });
});
