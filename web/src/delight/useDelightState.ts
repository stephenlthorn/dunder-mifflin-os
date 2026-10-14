// The delight layer's state for the whole app: the switches, this week's Dundies, Creed's corner, idle trips,
// daylight, the bobblehead, toasts and the easter eggs' listeners. App puts `value` in DelightContext.
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChatMessage, OfficeSnapshot } from '@shared/contract';
import type { Prefs } from '../prefs/prefs';
import { daylightAt } from './ambient/daylight';
import { tripsFor } from './ambient/trips';
import { useBobble } from './ambient/useBobble';
import { useUnattributed } from './creed/useUnattributed';
import { PLAIN, type DelightValue } from './DelightContext';
import { trophyShelf } from './dundies/awards';
import { useDundies } from './dundies/useDundies';
import { type Toast, twssFor } from './eggs/twss';
import { useKonami } from './eggs/useKonami';
import { delightMode } from './mode';
import { useTick } from './useTick';
import { useToasts } from './useToasts';

type Input = {
  snapshot: OfficeSnapshot | null;
  prefs: Prefs;
  demo: boolean; // the fixture demo (made-up timelines)
  officeUtc: boolean; // the demo day: office time is UTC
  reduceMotion: boolean;
  now: () => number; // the office clock
};

/** A local Date showing the office's wall time (the demo day keeps office time in UTC so every viewer sees the same). */
export function wallDate(ms: number, utc: boolean): Date {
  const d = new Date(ms);
  return utc ? new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()) : d;
}

export function useDelightState({ snapshot, prefs, demo, officeUtc, reduceMotion, now }: Input) {
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const mode = useMemo(() => delightMode({ tobyPref: prefs.tobyMode, search, chime: prefs.chime, reduceMotion }), [prefs.tobyMode, prefs.chime, reduceMotion, search]);
  const clock = useRef(now);
  clock.current = now;
  const officeNow = useCallback(() => clock.current(), []);
  const wallClock = useCallback(() => wallDate(clock.current(), officeUtc), [officeUtc]);
  const tick = useTick(officeUtc ? 2000 : 30_000, mode.trips || mode.ambient);
  const dundies = useDundies(snapshot, { demo, enabled: true, now: officeNow });
  const unattributed = useUnattributed(snapshot, demo);
  const nodding = useBobble(snapshot, mode.ambient && mode.motion);
  const { toasts, push } = useToasts();
  const [credits, setCredits] = useState(false);
  const lastTwss = useRef<number | null>(null);
  useKonami(mode.eggs, () => setCredits(true));

  const idle = snapshot ? snapshot.people.filter((p) => p.bot && snapshot.presence[p.id]?.status === 'idle').map((p) => p.id) : [];
  const tripMap = mode.trips ? tripsFor(idle, officeNow()) : new Map();
  const tripKey = [...tripMap].map(([id, k]) => `${id}:${k}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const trips = useMemo(() => tripMap, [tripKey]);
  const wall = wallClock();
  const daylight = mode.ambient ? daylightAt(wall.getHours() + wall.getMinutes() / 60) : null;
  void tick; // trips and daylight are read from the clock on every tick
  const digest = dundies.phase === 'ready' ? dundies.digest : null;
  const trophies = useMemo(() => (mode.jokes ? trophyShelf(digest) : PLAIN.trophies), [mode.jokes, digest]);

  const toast = useCallback((t: Toast) => { if (mode.eggs) push(t); }, [mode.eggs, push]);
  const heard = useCallback((msg: ChatMessage, author: string) => {
    if (!mode.eggs) return;
    const t = twssFor(msg, author, lastTwss.current, Date.now());
    if (!t) return;
    lastTwss.current = Date.now();
    push(t);
  }, [mode.eggs, push]);

  const value = useMemo<DelightValue>(() => ({
    mode, dundies, trophies, trips, unattributed, daylight, nodding, officeNow, wallClock, toast, heard,
  }), [mode, dundies, trophies, trips, unattributed, daylight, nodding, officeNow, wallClock, toast, heard]);
  const closeCredits = useCallback(() => setCredits(false), []);
  return { value, toasts, credits, closeCredits };
}
