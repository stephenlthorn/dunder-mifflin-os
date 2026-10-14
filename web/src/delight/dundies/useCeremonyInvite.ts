// Friday evening, Michael wants to hand out the Dundies: a small, dismissible invitation (never a window that steals
// focus), once a week per browser, never in Toby mode. Remembered in localStorage (a per-viewer convenience).
import { useCallback, useState } from 'react';
import { readStored, safeStorage, writeStored } from '../../prefs/storage';
import { ceremonyDue, weekKey } from './ceremony';

const KEY = 'dmos.dundies.seen.v1';

export function useCeremonyInvite(on: boolean, now: number): { invited: boolean; seen: () => void } {
  const [lastSeen, setLastSeen] = useState<string | null>(() => {
    const stored = readStored(safeStorage(), KEY);
    return typeof stored === 'string' ? stored : null;
  });
  const seen = useCallback(() => {
    const week = weekKey(new Date(now));
    writeStored(safeStorage(), KEY, week);
    setLastSeen(week);
  }, [now]);
  return { invited: on && ceremonyDue(new Date(now), lastSeen), seen };
}
