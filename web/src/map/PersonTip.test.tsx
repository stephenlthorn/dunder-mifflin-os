import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { PersonTip, tipAnchor } from './PersonTip';

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, bottom: top + height });

describe('tipAnchor', () => {
  it('centres the tip above the figure, in the map wrapper\'s pixels', () => {
    expect(tipAnchor('dwight', box(300, 400, 40, 60), { left: 100, top: 50 })).toEqual({ personId: 'dwight', x: 220, y: 350, below: false });
  });

  it('flips below the figure near the top edge', () => {
    expect(tipAnchor('pam', box(300, 80, 40, 60), { left: 0, top: 50 })).toEqual({ personId: 'pam', x: 320, y: 90, below: true });
  });
});

describe('PersonTip', () => {
  it('shows a small round portrait, the name and the bot status', () => {
    const html = renderToStaticMarkup(<PersonTip tip={{ personId: 'dwight', x: 10, y: 20, below: false }} snapshot={DEMO_SNAPSHOT} live={false} />);
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('portrait-tip');
    expect(html).toContain('Dwight Schrute');
    expect(html).toContain('campaigns · working');
    expect(html).toContain('Auditing the Q4 campaign report');
  });

  it('says "No bot yet" for unbotted staff and renders nothing for unknown ids', () => {
    expect(renderToStaticMarkup(<PersonTip tip={{ personId: 'jim', x: 0, y: 0, below: false }} snapshot={DEMO_SNAPSHOT} live />)).toContain('No bot yet');
    expect(renderToStaticMarkup(<PersonTip tip={{ personId: 'nobody', x: 0, y: 0, below: false }} snapshot={DEMO_SNAPSHOT} live />)).toBe('');
  });
});
