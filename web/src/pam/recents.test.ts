import { describe, expect, it } from 'vitest';
import { MAX_RECENTS, parseRecents, pushRecent } from './recents';

describe('recent items', () => {
  it('puts the newest first, without duplicates, capped', () => {
    const list = ['person:pam', 'room:ops'];
    expect(pushRecent(list, 'room:ops')).toEqual(['room:ops', 'person:pam']);
    expect(pushRecent(list, 'person:dwight')).toEqual(['person:dwight', 'person:pam', 'room:ops']);
    const full = Array.from({ length: MAX_RECENTS }, (_, i) => `task:${i}`);
    expect(pushRecent(full, 'person:jim')).toHaveLength(MAX_RECENTS);
    expect(pushRecent(full, 'person:jim')[0]).toBe('person:jim');
    expect(list).toEqual(['person:pam', 'room:ops']); // not mutated
  });

  it('parses only a list of short strings from storage', () => {
    expect(parseRecents(undefined)).toEqual([]);
    expect(parseRecents({ a: 1 })).toEqual([]);
    expect(parseRecents(['person:pam', 3, 'x'.repeat(500), 'room:ops'])).toEqual(['person:pam', 'room:ops']);
    expect(parseRecents(Array.from({ length: 20 }, (_, i) => `task:${i}`))).toHaveLength(MAX_RECENTS);
  });
});
