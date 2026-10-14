// Dwight's bobblehead nods for a few seconds when the bot at his desk finishes a run (bobble.ts).
import { useEffect, useRef, useState } from 'react';
import type { OfficeSnapshot } from '@shared/contract';
import { finishedRun } from './bobble';

export const BOBBLE_DESK = 'dwight';
const NOD_MS = 3200;

export function useBobble(snapshot: OfficeSnapshot | null, enabled: boolean): boolean {
  const prev = useRef<OfficeSnapshot | null>(null);
  const [nodding, setNodding] = useState(false);
  useEffect(() => {
    if (!snapshot) return undefined;
    const before = prev.current;
    prev.current = snapshot;
    if (!enabled || !finishedRun(before, snapshot, BOBBLE_DESK)) return undefined;
    setNodding(true);
    const timer = setTimeout(() => setNodding(false), NOD_MS);
    return () => clearTimeout(timer);
  }, [snapshot, enabled]);
  return nodding && enabled;
}
