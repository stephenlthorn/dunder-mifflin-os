// localStorage access that never throws: private windows, blocked cookies and full quotas all degrade to "nothing stored".
export type KeyValueStore = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

/** The browser's localStorage, or null when it can't be reached. */
export function safeStorage(): KeyValueStore | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Parsed JSON stored under `key`; undefined when missing, unreadable or not JSON. Callers validate the shape. */
export function readStored(store: KeyValueStore | null, key: string): unknown {
  if (!store) return undefined;
  try {
    const raw = store.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Store `value` as JSON; false when storage is unavailable or full. */
export function writeStored(store: KeyValueStore | null, key: string, value: unknown): boolean {
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
