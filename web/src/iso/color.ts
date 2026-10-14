// Small colour helpers for shading box faces. Non-hex inputs (gradients, urls) pass through untouched.

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

type Rgb = [number, number, number];

function parse(hex: string): Rgb | null {
  if (!HEX.test(hex)) return null;
  const raw = hex.slice(1);
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const toHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;

export function mix(a: string, b: string, t: number): string {
  const ca = parse(a);
  const cb = parse(b);
  if (!ca || !cb) return a;
  return toHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]);
}

/** amount > 0 lightens toward white, amount < 0 darkens toward black. */
export function shade(color: string, amount: number): string {
  if (!parse(color)) return color;
  return amount >= 0 ? mix(color, '#ffffff', amount) : mix(color, '#000000', -amount);
}

export type FaceColors = { top: string; left: string; right: string };

/** Top lightest, left (x-min) mid, right (y-min) darkest — the Drawbotics three-tone look. */
export function faceColors(side: string, top?: string): FaceColors {
  return { top: top ?? shade(side, 0.22), left: side, right: shade(side, -0.16) };
}
