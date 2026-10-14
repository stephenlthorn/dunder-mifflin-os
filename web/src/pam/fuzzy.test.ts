import { describe, expect, it } from 'vitest';
import { fuzzyScore, normalize } from './fuzzy';

describe('normalize', () => {
  it('lower-cases and strips accents', () => {
    expect(normalize('José Ñúñez')).toBe('jose nunez');
  });
});

describe('fuzzyScore', () => {
  it('returns null when the letters are not all there, in order', () => {
    expect(fuzzyScore('xyz', 'Dwight Schrute')).toBeNull();
    expect(fuzzyScore('thgiwd', 'Dwight')).toBeNull();
  });

  it('matches an empty query with a neutral score', () => {
    expect(fuzzyScore('', 'Anything')).toBe(0);
  });

  it('ranks exact > prefix > word start > substring > scattered letters', () => {
    const exact = fuzzyScore('pam', 'Pam')!;
    const prefix = fuzzyScore('pam', 'Pam Beesly')!;
    const wordStart = fuzzyScore('bee', 'Pam Beesly')!;
    const inside = fuzzyScore('ees', 'Pam Beesly')!;
    const scattered = fuzzyScore('pbs', 'Pam Beesly')!;
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(scattered);
    expect(scattered).toBeGreaterThan(0);
  });

  it('ignores case and accents', () => {
    expect(fuzzyScore('DWI', 'dwight')).not.toBeNull();
    expect(fuzzyScore('jose', 'José')).not.toBeNull();
  });

  it('prefers initials at word starts over letters buried in a word', () => {
    expect(fuzzyScore('ds', 'Dwight Schrute')!).toBeGreaterThan(fuzzyScore('ds', 'Odd shelves')!);
  });
});
