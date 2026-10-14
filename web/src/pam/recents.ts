// Ask Pam's recent items: item ids, newest first, kept in localStorage.
import { type KeyValueStore, readStored, writeStored } from '../prefs/storage';

export const RECENTS_KEY = 'dmos.pam.recents.v1';
export const MAX_RECENTS = 5;
const MAX_ID = 120;

export function pushRecent(list: readonly string[], id: string, max = MAX_RECENTS): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

export function parseRecents(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= MAX_ID).slice(0, MAX_RECENTS);
}

export const loadRecents = (store: KeyValueStore | null): string[] => parseRecents(readStored(store, RECENTS_KEY));
export const saveRecents = (store: KeyValueStore | null, list: readonly string[]): boolean => writeStored(store, RECENTS_KEY, list);
