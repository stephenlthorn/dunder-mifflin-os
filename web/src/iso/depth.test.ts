import { describe, expect, it } from 'vitest';
import { EYE } from './projection';
import { depthSort, inFront, paintOrder } from './depth';

const box = (x: number, y: number, w: number, d: number, h = 1, z = 0) => ({ x, y, z, w, d, h });
const order = (items: { id: string }[]) => items.map((i) => i.id);

const FAR_LEFT = { x: -100, y: -100, z: 60 };
const FAR_RIGHT = { x: 100, y: -100, z: 60 };

describe('inFront', () => {
  it('treats the box nearer the camera (smaller x or y, for an eye at the front-left) as in front', () => {
    expect(inFront(box(0, 0, 1, 1), box(0, 2, 1, 1), FAR_LEFT)).toBe(true);
    expect(inFront(box(0, 2, 1, 1), box(0, 0, 1, 1), FAR_LEFT)).toBe(false);
    expect(inFront(box(0, 0, 1, 1), box(2, 0, 1, 1), FAR_LEFT)).toBe(true);
  });

  it('follows the eye: left of the camera the box with the larger x is nearer', () => {
    expect(inFront(box(0, 0, 1, 1), box(2, 0, 1, 1), FAR_RIGHT)).toBe(false);
    expect(inFront(box(2, 0, 1, 1), box(0, 0, 1, 1), FAR_RIGHT)).toBe(true);
    expect(inFront(box(0, 0, 1, 1), box(0, 2, 1, 1), FAR_RIGHT)).toBe(true); // still in front of the camera in y
  });

  it('uses the map camera by default, which hangs over the left half of the office', () => {
    const left = box(EYE.x - 6, 10, 1, 1);
    const lefter = box(EYE.x - 9, 10, 1, 1);
    const right = box(EYE.x + 4, 10, 1, 1);
    const righter = box(EYE.x + 8, 10, 1, 1);
    expect(inFront(left, lefter)).toBe(true);
    expect(inFront(right, righter)).toBe(true);
  });

  it('treats a box resting on top of another as in front', () => {
    expect(inFront(box(0, 0, 1, 1, 0.2, 1), box(0, 0, 1, 1, 1, 0))).toBe(true);
  });

  it('returns null for intersecting boxes', () => {
    expect(inFront(box(0, 0, 2, 2), box(1, 1, 2, 2))).toBeNull();
  });
});

describe('paintOrder', () => {
  it('agrees with every plane that splits the boxes, or says either when the planes disagree', () => {
    expect(paintOrder(box(0, 0, 1, 1), box(0, 2, 1, 1), FAR_LEFT)).toBe(true);
    expect(paintOrder(box(0, 2, 1, 1), box(0, 0, 1, 1), FAR_LEFT)).toBe(false);
    // left-front vs right-back seen from the far right: x says the right one is nearer, y the front one: neither hides the other
    expect(paintOrder(box(0, 0, 1, 1), box(2, 2, 1, 1), FAR_RIGHT)).toBe('either');
    expect(paintOrder(box(0, 0, 2, 2), box(1, 1, 2, 2), FAR_LEFT)).toBeNull();
  });

  it('says either when the eye stands in the gap between two boxes', () => {
    expect(paintOrder(box(0, 5, 1, 1), box(3, 5, 1, 1), { x: 2, y: -50, z: 40 })).toBe('either');
  });
});

describe('depthSort', () => {
  it('draws far things first', () => {
    const items = [
      { id: 'near', box: box(0, 0, 1, 1) },
      { id: 'far', box: box(1, 1, 1, 1) },
    ];
    expect(order(depthSort(items, FAR_LEFT))).toEqual(['far', 'near']);
    expect(order(depthSort([{ id: 'near', box: box(0, 0, 1, 1) }, { id: 'far', box: box(0, 2, 1, 1) }]))).toEqual(['far', 'near']);
  });

  it('handles a long wall that a centroid sort gets wrong', () => {
    const at = EYE.x + 2;
    const wall = { id: 'wall', box: box(at - 0.15, 0, 0.3, 32, 2.5) };
    const behind = { id: 'behind', box: box(at + 1, 10, 1, 1) }; // overlaps the wall on screen, nearer by centroid
    const inFrontOfWall = { id: 'front', box: box(at - 3, 20, 1, 1) };
    expect(order(depthSort([wall, behind, inFrontOfWall]))).toEqual(['behind', 'wall', 'front']);
  });

  it('sorts a wall left of the camera the other way round: the far side is its left', () => {
    const at = EYE.x - 8;
    const wall = { id: 'wall', box: box(at - 0.15, 0, 0.3, 32, 2.5) };
    const behind = { id: 'behind', box: box(at - 2, 10, 1, 1) };
    const nearer = { id: 'front', box: box(at + 1, 12, 1, 1) };
    expect(order(depthSort([nearer, wall, behind]))).toEqual(['behind', 'wall', 'front']);
  });

  it('puts a chair facing its desk in front of the desk when the chair is nearer', () => {
    const desk = { id: 'desk', box: box(10, 10, 3, 1.6, 1.5) };
    const chair = { id: 'chair', box: box(11, 8.8, 1.2, 1.2, 2.2) };
    expect(order(depthSort([chair, desk]))).toEqual(['desk', 'chair']);
  });

  it('draws an item on a desk after the desk', () => {
    const desk = { id: 'desk', box: box(10, 10, 3, 1.6, 1.5) };
    const monitor = { id: 'monitor', box: box(11, 10.5, 1, 0.3, 0.8, 1.5) };
    expect(order(depthSort([monitor, desk]))).toEqual(['desk', 'monitor']);
  });

  it('is stable and does not mutate its input', () => {
    const items = [
      { id: 'a', box: box(0, 5, 1, 1) },
      { id: 'b', box: box(5, 0, 1, 1) },
      { id: 'c', box: box(3, 3, 1, 1) },
    ];
    const copy = items.slice();
    const once = order(depthSort(items));
    expect(order(depthSort(items))).toEqual(once);
    expect(items).toEqual(copy);
  });

  it('still returns every item when overlaps form a cycle', () => {
    const items = [
      { id: 'a', box: box(0, 0, 4, 1) },
      { id: 'b', box: box(1, 0.5, 1, 4) },
      { id: 'c', box: box(0, 3, 4, 1) },
    ];
    expect(depthSort(items)).toHaveLength(3);
  });
});
