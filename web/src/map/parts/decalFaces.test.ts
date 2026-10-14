import { describe, expect, it } from 'vitest';
import { decalVisible } from './decalFaces';
import { type Decal, faceRect, flatRect } from './parts';

const box = { x: 10, y: 10, z: 0, w: 2, d: 1, h: 2 };
const FROM_LEFT = { x: -50, y: -50, z: 60 };
const FROM_RIGHT = { x: 60, y: -50, z: 60 };

describe('decalVisible', () => {
  it('shows a decal on the x-min face only to an eye left of the box, and on the x-max face only to one right of it', () => {
    const west = faceRect('x', 10, 10.2, 10.8, 0.5, 1.5, '#000');
    const east = faceRect('x', 12, 10.2, 10.8, 0.5, 1.5, '#000');
    expect(decalVisible(box, west, FROM_LEFT)).toBe(true);
    expect(decalVisible(box, west, FROM_RIGHT)).toBe(false);
    expect(decalVisible(box, east, FROM_RIGHT)).toBe(true);
    expect(decalVisible(box, east, FROM_LEFT)).toBe(false);
  });

  it('shows the front (y-min) face and the top, but never the back face, to an eye in front and above', () => {
    expect(decalVisible(box, faceRect('y', 10, 10.2, 11.8, 0.5, 1.5, '#000'), FROM_LEFT)).toBe(true);
    expect(decalVisible(box, faceRect('y', 11, 10.2, 11.8, 0.5, 1.5, '#000'), FROM_LEFT)).toBe(false);
    expect(decalVisible(box, flatRect(10.2, 10.2, 1, 0.5, 2, '#000'), FROM_RIGHT)).toBe(true);
  });

  it('keeps lines and text that lie on a hidden face hidden, and anything not on a face visible', () => {
    const lines: Decal = { kind: 'lines', stroke: '#000', segments: [[{ x: 10, y: 10.1, z: 1 }, { x: 10, y: 10.9, z: 1 }]] };
    expect(decalVisible(box, lines, FROM_RIGHT)).toBe(false);
    const text: Decal = { kind: 'text', at: { x: 12, y: 10.5, z: 1 }, axis: 'y', text: 'A', size: 0.3, fill: '#000' };
    expect(decalVisible(box, text, FROM_LEFT)).toBe(false);
    expect(decalVisible(box, flatRect(10.2, 10.2, 1, 0.5, -0.4, '#000'), FROM_LEFT)).toBe(true); // a stair tread below a well
  });
});
