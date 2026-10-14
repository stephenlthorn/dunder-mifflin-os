// The viewer's preferences as React state, saved to localStorage on every change (silently skipped if storage is blocked).
import { useCallback, useState } from 'react';
import { type Prefs, loadPrefs, savePrefs } from './prefs';
import { safeStorage } from './storage';

export function usePrefs(): { prefs: Prefs; setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void } {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs(safeStorage()));
  const setPref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      savePrefs(safeStorage(), next);
      return next;
    });
  }, []);
  return { prefs, setPref };
}
