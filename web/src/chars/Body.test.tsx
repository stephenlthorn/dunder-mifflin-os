import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Look } from '@shared/contract';
import { BackBody, FrontBody } from './Body';

const GI: Look = { skin: '#ebc29c', hair: '#2b2019', hairStyle: 'short', shirt: '#e3b48c', jacket: '#f6f5f0' };
const svg = (node: React.ReactNode) => renderToStaticMarkup(<svg>{node}</svg>);

describe('Body', () => {
  it('ties a belt round the waist, front and back, when the look has one', () => {
    for (const Body of [FrontBody, BackBody]) {
      const belted = svg(<Body look={{ ...GI, belt: '#151515' }} />);
      expect(belted).toContain('class="belt"');
      expect(belted).toContain('#151515');
      expect(svg(<Body look={GI} />)).not.toContain('class="belt"');
    }
  });
});
