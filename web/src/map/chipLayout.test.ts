import { describe, expect, it } from 'vitest';
import { type LabelRect, layoutLabels } from './chipLayout';

const rect = (id: string, x: number, y: number, extra: Partial<LabelRect> = {}): LabelRect => ({ id, x, y, w: 40, h: 10, ...extra });
const box = (l: LabelRect, p: { dx: number; dy: number }) => ({ x0: l.x + p.dx - l.w / 2, x1: l.x + p.dx + l.w / 2, y0: l.y + p.dy - l.h, y1: l.y + p.dy });
const disjoint = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;

describe('layoutLabels', () => {
  it('leaves non-overlapping labels where they are', () => {
    expect(layoutLabels([rect('a', 0, 0), rect('b', 100, 0)], [])).toEqual({ a: { dx: 0, dy: 0 }, b: { dx: 0, dy: 0 } });
  });

  it('moves the label further back off the one in front, without overlap', () => {
    const front = rect('front', 0, 50);
    const back = rect('back', 10, 45);
    const out = layoutLabels([front, back], []);
    expect(out.front).toEqual({ dx: 0, dy: 0 });
    expect(out.back).not.toEqual({ dx: 0, dy: 0 });
    expect(disjoint(box(front, out.front!), box(back, out.back!))).toBe(true);
  });

  it('moves labels off fixed obstacles such as room signs', () => {
    const out = layoutLabels([rect('a', 0, 0)], [rect('sign', 0, 2, { w: 60, h: 14 })]);
    expect(out.a).not.toEqual({ dx: 0, dy: 0 });
  });

  it('ignores an obstacle owned by the label itself but avoids other figures', () => {
    expect(layoutLabels([rect('a', 0, 0)], [rect('fig-a', 0, 12, { w: 20, h: 30, owner: 'a' })]).a).toEqual({ dx: 0, dy: 0 });
    expect(layoutLabels([rect('a', 0, 0)], [rect('fig-b', 0, 12, { w: 20, h: 30, owner: 'b' })]).a).not.toEqual({ dx: 0, dy: 0 });
  });

  it('hides an optional label when there is no room, but never a required one', () => {
    const wall = [rect('wall', 0, 200, { w: 1000, h: 1000 })];
    const out = layoutLabels([rect('opt', 0, 0, { optional: true }), rect('req', 300, 0)], wall);
    expect(out.opt).toBeNull();
    expect(out.req).not.toBeNull();
  });

  it('places higher-priority labels first', () => {
    const out = layoutLabels([rect('low', 0, 0, { priority: 1 }), rect('high', 5, -2, { priority: 0 })], []);
    expect(out.high).toEqual({ dx: 0, dy: 0 });
  });

  it('does not mutate its input', () => {
    const items = [rect('a', 0, 0), rect('b', 0, 1)];
    const copy = JSON.parse(JSON.stringify(items));
    layoutLabels(items, []);
    expect(items).toEqual(copy);
  });
});
