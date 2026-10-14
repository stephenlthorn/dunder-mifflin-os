// The viewer's preferences (Settings popover), kept in localStorage. Stored data is untrusted: only known boolean keys survive.
import { type KeyValueStore, readStored, writeStored } from './storage';

export type Prefs = {
  paletteHotkey: boolean; // ⌘K / Ctrl+K opens Ask Pam
  singleKeys: boolean; // "/" opens Ask Pam and "?" shows the shortcuts (single-key shortcuts must be switchable off)
  notifications: boolean; // browser notifications while you're away (also needs the browser's permission)
  chime: boolean; // a soft chime when a bot errors or needs you
  reduceMotion: boolean; // no camera glides or walk-ins (the system's reduced-motion setting counts too)
  tobyMode: boolean; // no jokes, ambient life, sounds or easter eggs (?toby=1 does it too); see delight/mode.ts
};

export const DEFAULT_PREFS: Prefs = { paletteHotkey: true, singleKeys: true, notifications: false, chime: false, reduceMotion: false, tobyMode: false };
export const PREFS_KEY = 'dmos.prefs.v1';

const KEYS = Object.keys(DEFAULT_PREFS) as (keyof Prefs)[];

export function parsePrefs(raw: unknown): Prefs {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return DEFAULT_PREFS;
  const src = raw as Record<string, unknown>;
  return KEYS.reduce<Prefs>((acc, k) => (typeof src[k] === 'boolean' ? { ...acc, [k]: src[k] } : acc), DEFAULT_PREFS);
}

export const loadPrefs = (store: KeyValueStore | null): Prefs => parsePrefs(readStored(store, PREFS_KEY));
export const savePrefs = (store: KeyValueStore | null, prefs: Prefs): boolean => writeStored(store, PREFS_KEY, prefs);
