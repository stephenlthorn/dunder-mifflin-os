import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, PREFS_KEY, loadPrefs, parsePrefs, savePrefs } from './prefs';
import { readStored, writeStored } from './storage';

const memory = (seed: Record<string, string> = {}) => {
  const data = new Map(Object.entries(seed));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, data };
};
const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };

describe('parsePrefs', () => {
  it('falls back to the defaults for missing, invalid or non-object values', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('nope')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs([true])).toEqual(DEFAULT_PREFS);
  });

  it('keeps valid booleans and ignores wrong types and unknown keys', () => {
    const prefs = parsePrefs({ chime: true, notifications: 'yes', reduceMotion: true, evil: '<script>' });
    expect(prefs).toEqual({ ...DEFAULT_PREFS, chime: true, reduceMotion: true });
    expect(prefs).not.toHaveProperty('evil');
  });

  it('defaults: shortcuts on; notifications, chime, reduced motion and Toby mode off (jokes on, sounds off)', () => {
    expect(DEFAULT_PREFS).toEqual({ paletteHotkey: true, singleKeys: true, notifications: false, chime: false, reduceMotion: false, tobyMode: false });
  });

  it('keeps Toby mode when it is a boolean', () => {
    expect(parsePrefs({ tobyMode: true }).tobyMode).toBe(true);
    expect(parsePrefs({ tobyMode: 'yes' }).tobyMode).toBe(false);
  });
});

describe('loading and saving', () => {
  it('round-trips through storage as JSON', () => {
    const store = memory();
    expect(savePrefs(store, { ...DEFAULT_PREFS, chime: true })).toBe(true);
    expect(JSON.parse(store.data.get(PREFS_KEY)!)).toMatchObject({ chime: true });
    expect(loadPrefs(store)).toEqual({ ...DEFAULT_PREFS, chime: true });
  });

  it('survives corrupt JSON, blocked storage and no storage at all', () => {
    expect(loadPrefs(memory({ [PREFS_KEY]: '{not json' }))).toEqual(DEFAULT_PREFS);
    expect(loadPrefs(broken)).toEqual(DEFAULT_PREFS);
    expect(loadPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(savePrefs(broken, DEFAULT_PREFS)).toBe(false);
    expect(savePrefs(null, DEFAULT_PREFS)).toBe(false);
  });
});

describe('storage helpers', () => {
  it('read returns undefined and write returns false instead of throwing', () => {
    expect(readStored(broken, 'k')).toBeUndefined();
    expect(writeStored(broken, 'k', 1)).toBe(false);
    const store = memory();
    expect(writeStored(store, 'k', ['a'])).toBe(true);
    expect(readStored(store, 'k')).toEqual(['a']);
  });
});
