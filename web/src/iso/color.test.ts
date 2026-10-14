import { describe, expect, it } from 'vitest';
import { faceColors, mix, shade } from './color';

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
};

describe('shade', () => {
  it('lightens with a positive amount and darkens with a negative one', () => {
    expect(lum(shade('#808080', 0.2))).toBeGreaterThan(lum('#808080'));
    expect(lum(shade('#808080', -0.2))).toBeLessThan(lum('#808080'));
  });

  it('accepts three-digit hex and clamps at white/black', () => {
    expect(shade('#fff', 0.5)).toBe('#ffffff');
    expect(shade('#000', -0.5)).toBe('#000000');
  });

  it('returns unknown colour strings unchanged', () => {
    expect(shade('url(#x)', 0.2)).toBe('url(#x)');
  });
});

describe('mix', () => {
  it('blends two colours', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

describe('faceColors', () => {
  it('makes the top lightest, the left mid and the right darkest', () => {
    const c = faceColors('#b98a5a');
    expect(lum(c.top)).toBeGreaterThan(lum(c.left));
    expect(lum(c.left)).toBeGreaterThan(lum(c.right));
  });

  it('uses an explicit top colour when given', () => {
    expect(faceColors('#b98a5a', '#d1a575').top).toBe('#d1a575');
  });
});
