import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { portraitUrl } from '../data/api';
import { Portrait, portraitView } from './Portrait';

const dwight = DEMO_SNAPSHOT.people.find((p) => p.id === 'dwight')!;
const jim = DEMO_SNAPSHOT.people.find((p) => p.id === 'jim')!;

describe('portraitView', () => {
  it('shows the photo only in live mode once it has loaded; the drawn character otherwise', () => {
    expect(portraitView(false, 'loading')).toEqual({ mode: 'drawn', requestPhoto: false });
    expect(portraitView(false, 'loaded')).toEqual({ mode: 'drawn', requestPhoto: false });
    expect(portraitView(true, 'loading')).toEqual({ mode: 'loading', requestPhoto: true });
    expect(portraitView(true, 'loaded')).toEqual({ mode: 'photo', requestPhoto: true });
    expect(portraitView(true, 'failed')).toEqual({ mode: 'drawn', requestPhoto: false }); // 404 / error: no broken image
  });
});

describe('Portrait', () => {
  it('draws the mini character in demo mode and never asks the server', () => {
    const html = renderToStaticMarkup(<Portrait person={dwight} live={false} />);
    expect(html).toContain('data-state="drawn"');
    expect(html).toContain('<svg');
    expect(html).not.toContain('<img');
  });

  it('asks for /api/portraits/:id in live mode, with the drawn character showing until the photo arrives', () => {
    const html = renderToStaticMarkup(<Portrait person={jim} live />);
    expect(html).toMatch(/<img[^>]+src="\/api\/portraits\/jim"/);
    expect(html).toContain('data-state="loading"');
    expect(html).toContain('<svg');
  });

  it('is a labelled image in a window header and decorative next to a name', () => {
    expect(renderToStaticMarkup(<Portrait person={dwight} live={false} />)).toContain('aria-label="Dwight Schrute portrait"');
    const small = renderToStaticMarkup(<Portrait person={dwight} live size="sm" decorative />);
    expect(small).toContain('aria-hidden="true"');
    expect(small).not.toContain('aria-label');
    expect(small).toContain('portrait-sm');
  });

  it('builds the portrait URL from the person id', () => {
    expect(portraitUrl('dwight')).toBe('/api/portraits/dwight');
    expect(portraitUrl('a/b')).toBe('/api/portraits/a%2Fb');
  });
});
