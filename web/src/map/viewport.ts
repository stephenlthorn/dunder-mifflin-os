// Pan/zoom maths for the map: a view is screen = world * scale + (x, y).
import type { Bounds, Pt } from '../iso/projection';

export type View = { scale: number; x: number; y: number };
export const MIN_SCALE = 0.35;
export const MAX_SCALE = 4;

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export function fitView(b: Bounds, viewport: { w: number; h: number }, padding = 24): View {
  const cw = Math.max(1, b.maxX - b.minX);
  const ch = Math.max(1, b.maxY - b.minY);
  const scale = clampScale(Math.min((viewport.w - padding * 2) / cw, (viewport.h - padding * 2) / ch));
  return {
    scale,
    x: viewport.w / 2 - ((b.minX + b.maxX) / 2) * scale,
    y: viewport.h / 2 - ((b.minY + b.maxY) / 2) * scale,
  };
}

export const toWorld = (v: View, p: Pt): Pt => ({ x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale });

export function zoomAt(v: View, factor: number, at: Pt): View {
  const scale = clampScale(v.scale * factor);
  const w = toWorld(v, at);
  return { scale, x: at.x - w.x * scale, y: at.y - w.y * scale };
}

export const panBy = (v: View, dx: number, dy: number): View => ({ ...v, x: v.x + dx, y: v.y + dy });

export const easeInOutCubic = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
};

/** A view that puts world point `p` in the middle of the viewport at `scale` (clamped). */
export function centerOn(p: Pt, scale: number, viewport: { w: number; h: number }): View {
  const s = clampScale(scale);
  return { scale: s, x: viewport.w / 2 - p.x * s, y: viewport.h / 2 - p.y * s };
}

/** The camera part-way (t in 0..1, eased) from view a to view b: the centre glides, the zoom changes geometrically. */
export function interpolateView(a: View, b: View, t: number, viewport: { w: number; h: number }): View {
  if (t <= 0) return a;
  const e = easeInOutCubic(t);
  const mid = { x: viewport.w / 2, y: viewport.h / 2 };
  const ca = toWorld(a, mid);
  const cb = toWorld(b, mid);
  const scale = a.scale * (b.scale / a.scale) ** e;
  return centerOn({ x: ca.x + (cb.x - ca.x) * e, y: ca.y + (cb.y - ca.y) * e }, scale, viewport);
}
