// Measure label text for chip sizing; falls back to an estimate where canvas is unavailable (tests, old browsers).
const cache = new Map<string, number>();
let ctx: CanvasRenderingContext2D | null | undefined;

export const CHIP_FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function textWidth(text: string, size: number, weight = 400): number {
  const key = `${weight}|${size}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (ctx === undefined) {
    try {
      ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    } catch {
      ctx = null;
    }
  }
  let w = text.length * size * (weight >= 600 ? 0.6 : 0.54);
  if (ctx) {
    ctx.font = `${weight} ${size}px ${CHIP_FONT_FAMILY}`;
    w = ctx.measureText(text).width;
  }
  cache.set(key, w);
  return w;
}
