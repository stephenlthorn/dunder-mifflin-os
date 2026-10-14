import { describe, expect, it } from 'vitest';
import { searchPam } from '../pam/search';
import { delightPamItems } from './pamItems';

describe('Ask Pam: the Dundies and Creed\'s corner', () => {
  it('finds the ceremony and Creed\'s corner by their names and what they do', () => {
    const items = delightPamItems({ toby: false, creedCount: 3 });
    expect(items.map((i) => [i.label, i.action.type])).toEqual([['The Dundies', 'dundies'], ['Creed’s corner', 'creed']]);
    expect(items[1]?.detail).toBe('3 things nobody can explain');
    const top = (q: string) => searchPam(items, q, [])[0]?.items[0]?.action.type;
    expect(top('awards')).toBe('dundies');
    expect(top('unattributed')).toBe('creed');
  });

  it('are the weekly review and unattributed activity in Toby mode', () => {
    const items = delightPamItems({ toby: true, creedCount: 0 });
    expect(items.map((i) => i.label)).toEqual(['Weekly review', 'Unattributed activity']);
    expect(items[1]?.detail).toBe('Nothing unattributed');
  });
});
