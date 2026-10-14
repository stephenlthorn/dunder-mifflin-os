// Ask Pam's recent items as React state, persisted to localStorage when it can be.
import { useCallback, useState } from 'react';
import { safeStorage } from '../prefs/storage';
import { loadRecents, pushRecent, saveRecents } from './recents';

export function usePamRecents(): { recents: string[]; remember: (id: string) => void } {
  const [recents, setRecents] = useState<string[]>(() => loadRecents(safeStorage()));
  const remember = useCallback((id: string) => {
    setRecents((list) => {
      const next = pushRecent(list, id);
      saveRecents(safeStorage(), next);
      return next;
    });
  }, []);
  return { recents, remember };
}
