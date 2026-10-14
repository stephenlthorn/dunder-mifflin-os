// Pam's phone rings with the Settings chime (the Settings `chime` preference) when something new needs you that the
// needs-input notifications don't already chime for: a request from a bot in a meeting or in error, or from an agent
// without a desk. Never on the first snapshot.
import { useEffect, useRef } from 'react';
import type { OfficeSnapshot } from '@shared/contract';
import { newRings, phoneKeys } from '../office/needsYou';
import { playChime } from './chime';

export function usePhoneRing(snapshot: OfficeSnapshot | null, chime: boolean): void {
  const seen = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (!snapshot) return;
    const keys = phoneKeys(snapshot);
    const before = seen.current;
    seen.current = keys;
    if (before && chime && newRings(before, keys).length > 0) playChime();
  }, [snapshot, chime]);
}
