import { describe, expect, it } from 'vitest';
import { ELLIPSE_RY, EYE, UNIT_PX, Z_PX, boxFaces, facesCamera, project, scaleAt, screenBounds, toPath, unproject } from './projection';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

const angleOf = (a: { x: number; y: number }, b: { x: number; y: number }) => (Math.atan2(-(b.y - a.y), Math.abs(b.x - a.x)) * 180) / Math.PI;
const len = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y);
const MID = { x: 32, y: 16 }; // the middle of the bullpen, where the camera aims

describe('project', () => {
  it('maps the middle of the bullpen (the camera target) to the screen origin', () => {
    const p = project(MID);
    close(p.x, 0);
    close(p.y, 0);
  });

  it('sends +x to the right and up, +y to the left and up', () => {
    const o = project(MID);
    const px = project({ ...MID, x: MID.x + 1 });
    const py = project({ ...MID, y: MID.y + 1 });
    expect(px.x).toBeGreaterThan(o.x);
    expect(px.y).toBeLessThan(o.y);
    expect(py.x).toBeLessThan(o.x);
    expect(py.y).toBeLessThan(o.y);
  });

  it('looks along the long building like the render: +x climbs gently, +y steeply', () => {
    const o = project(MID);
    const ax = angleOf(o, project({ ...MID, x: MID.x + 1 }));
    const ay = angleOf(o, project({ ...MID, y: MID.y + 1 }));
    expect(ax).toBeGreaterThan(14);
    expect(ax).toBeLessThan(26);
    expect(ay).toBeGreaterThan(50);
    expect(ay).toBeLessThan(68);
  });

  it('draws a unit of height shorter than a unit along the floor (a high camera)', () => {
    expect(Z_PX).toBeLessThan(UNIT_PX * 0.7);
    expect(ELLIPSE_RY).toBeGreaterThan(UNIT_PX * 0.7);
  });

  it('sends +z up the screen', () => {
    const a = project(MID);
    const p = project({ ...MID, z: 2 });
    close(p.x, a.x);
    expect(p.y).toBeLessThan(a.y);
  });

  it('round-trips floor points through unproject', () => {
    const world = { x: 13.5, y: 7.25 };
    const back = unproject(project(world));
    close(back.x, world.x);
    close(back.y, world.y);
  });

  it('round-trips raised and far-away points through unproject at their height', () => {
    for (const world of [{ x: 60, y: 28, z: 1.5 }, { x: -7, y: 20, z: 0 }, { x: 30, y: 45, z: 3 }]) {
      const back = unproject(project(world), world.z);
      close(back.x, world.x);
      close(back.y, world.y);
    }
  });
});

// The render's camera is a wide-angle pinhole close above the front of the building: the walls' depth lines fan out
// (near-vertical at the left end, steep diagonals at the right end), the back wall is drawn shorter than the front
// and the front-left corner far larger than the back-right one.
describe('perspective like the render', () => {
  const offVertical = (x: number, y0: number, y1: number) => 90 - Math.abs(angleOf(project({ x, y: y0 }), project({ x, y: y1 })));

  it('hangs the camera above the front of the building, over its left half', () => {
    expect(EYE.y).toBeLessThan(0);
    expect(EYE.z).toBeGreaterThan(25);
    expect(EYE.x).toBeGreaterThan(10);
    expect(EYE.x).toBeLessThan(26);
  });

  it('fans the depth lines: the main room’s left wall stands near-vertical, the right end wall leans steeply', () => {
    expect(offVertical(10, 0, 26)).toBeLessThan(22);
    expect(offVertical(72, 0, 35)).toBeGreaterThan(38);
    expect(offVertical(72, 0, 35) - offVertical(10, 0, 26)).toBeGreaterThan(22);
  });

  it('draws the back wall clearly shorter than the front of the main room', () => {
    const front = len(project({ x: 10, y: 0 }), project({ x: 72, y: 0 }));
    const back = len(project({ x: 10, y: 35 }), project({ x: 72, y: 35 }));
    expect(back / front).toBeLessThan(0.8);
    expect(back / front).toBeGreaterThan(0.5);
  });

  it('draws the near (front-left) end much larger than the far (back-right) end', () => {
    const near = len(project({ x: 10, y: 0 }), project({ x: 12, y: 0 }));
    const far = len(project({ x: 70, y: 31 }), project({ x: 72, y: 31 }));
    expect(near / far).toBeGreaterThan(1.4);
    expect(scaleAt({ x: 10, y: 0 }) / scaleAt({ x: 72, y: 35 })).toBeGreaterThan(1.5);
    expect(scaleAt({ x: 10, y: 0 }) / scaleAt({ x: 72, y: 35 })).toBeLessThan(2.6);
  });

  it('keeps straight lines straight', () => {
    const [a, b, c] = [{ x: -7, y: 31, z: 4.4 }, { x: 30, y: 31, z: 4.4 }, { x: 72, y: 31, z: 4.4 }].map(project);
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    expect(Math.abs(cross) / (Math.hypot(c.x - a.x, c.y - a.y) ** 2)).toBeLessThan(1e-9);
  });

  it('gives the local magnification of short lengths through scaleAt', () => {
    const atMid = len(project(MID), project({ ...MID, x: MID.x + 0.1 }));
    for (const p of [{ x: 10, y: 0 }, { x: 50, y: 20 }, { x: 70, y: 30 }]) {
      const here = len(project(p), project({ ...p, x: p.x + 0.1 }));
      const ratio = here / atMid / scaleAt(p);
      expect(ratio).toBeGreaterThan(0.85);
      expect(ratio).toBeLessThan(1.15);
    }
  });
});

describe('boxFaces', () => {
  const box = { x: 40, y: 2, z: 0, w: 3, d: 2, h: 1.5 };

  it('returns the top and two four-point side faces', () => {
    const faces = boxFaces(box);
    expect(faces.top).toHaveLength(4);
    expect(faces.left).toHaveLength(4);
    expect(faces.right).toHaveLength(4);
  });

  it('puts the top face at the box height', () => {
    const { top } = boxFaces(box);
    const corner = project({ x: 40, y: 2, z: 1.5 });
    close(top[0].x, corner.x);
    close(top[0].y, corner.y);
  });

  it('draws the x face toward the eye: x-min right of the camera, x-max left of it, none above it', () => {
    const right = boxFaces(box);
    expect(unproject(right.left[0], 0).x).toBeCloseTo(40, 6);
    const leftBox = { ...box, x: EYE.x - 8 };
    expect(unproject(boxFaces(leftBox).left[0], 0).x).toBeCloseTo(EYE.x - 5, 6);
    expect(boxFaces({ ...box, x: EYE.x - 1 }).left).toEqual([]);
  });

  it('draws the y-min face as the right face, and follows an explicit eye', () => {
    expect(unproject(boxFaces(box).right[1], 0).y).toBeCloseTo(2, 6);
    const fromLeft = boxFaces(box, { x: -100, y: -100, z: 50 });
    expect(unproject(fromLeft.left[0], 0).x).toBeCloseTo(40, 6);
  });
});

describe('screenBounds', () => {
  it('contains every projected corner', () => {
    const box = { x: 0, y: 0, z: 0, w: 2, d: 2, h: 2 };
    const b = screenBounds(box);
    const top = project({ x: 2, y: 2, z: 2 });
    const front = project({ x: 0, y: 0, z: 0 });
    expect(b.minY).toBeLessThanOrEqual(top.y);
    expect(b.maxY).toBeGreaterThanOrEqual(front.y);
    expect(b.maxX).toBeGreaterThan(b.minX);
  });
});

describe('facesCamera', () => {
  it('sees a vertical face whose outward normal points toward the eye, wherever the face is', () => {
    const left = { x: EYE.x - 10, y: 10 };
    const right = { x: EYE.x + 10, y: 10 };
    expect(facesCamera(1, 0, left)).toBe(true); // a wall left of the camera shows its right-hand face
    expect(facesCamera(-1, 0, left)).toBe(false);
    expect(facesCamera(-1, 0, right)).toBe(true);
    expect(facesCamera(1, 0, right)).toBe(false);
    expect(facesCamera(0, -1, right)).toBe(true);
    expect(facesCamera(0, 1, left)).toBe(false);
  });
});

describe('toPath', () => {
  it('builds a closed SVG path with rounded coordinates', () => {
    expect(toPath([{ x: 0, y: 0 }, { x: 1.23456, y: 2 }, { x: 3, y: -4.5 }])).toBe('M0 0L1.23 2L3 -4.5Z');
  });

  it('draws nothing for a face the camera can’t see', () => {
    expect(toPath([])).toBe('');
  });
});
