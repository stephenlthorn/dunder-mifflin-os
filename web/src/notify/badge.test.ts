import { describe, expect, it } from 'vitest';
import { BASE_TITLE, badgeTitle, faviconHref, faviconSvg } from './badge';

describe('tab title badge', () => {
  it('prefixes the count, and drops it at zero', () => {
    expect(badgeTitle(2)).toBe('(2) Dunder Mifflin OS');
    expect(badgeTitle(0)).toBe(BASE_TITLE);
    expect(badgeTitle(120)).toBe('(99+) Dunder Mifflin OS');
  });
});

describe('favicon', () => {
  it('is a small SVG with a red dot only when something needs attention', () => {
    expect(faviconSvg(false)).toMatch(/^<svg /);
    expect(faviconSvg(false)).not.toContain('<circle');
    expect(faviconSvg(true)).toContain('<circle');
    expect(faviconHref(true)).toMatch(/^data:image\/svg\+xml,/);
    expect(decodeURIComponent(faviconHref(true).slice('data:image/svg+xml,'.length))).toBe(faviconSvg(true));
  });
});
