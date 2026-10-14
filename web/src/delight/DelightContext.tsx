// What the delight layer knows, for the map, windows and chat to read without threading props through every layer.
// Outside a provider everything is off (a plain dashboard), so components render as before in tests and Toby mode.
import { createContext, useContext } from 'react';
import type { ChatMessage } from '@shared/contract';
import type { UnattributedItem } from '@shared/unattributed';
import type { Daylight } from './ambient/daylight';
import type { TripKind } from './ambient/trips';
import type { Digest, Dundie } from './dundies/awards';
import type { Toast } from './eggs/twss';
import type { DelightMode } from './mode';

export type DundiesState = { phase: 'loading' } | { phase: 'ready'; digest: Digest } | { phase: 'error'; error: string };

export type DelightValue = {
  mode: DelightMode;
  dundies: DundiesState;
  trophies: ReadonlyMap<string, readonly Dundie[]>; // person id -> the awards on their desk
  trips: ReadonlyMap<string, TripKind>; // idle bots away from their desk right now
  unattributed: readonly UnattributedItem[]; // Creed's corner
  daylight: Daylight | null; // null: no light through the windows (Toby mode)
  nodding: boolean; // Dwight's bobblehead
  officeNow: () => number; // the office clock (the demo day's office time, else now)
  wallClock: () => Date; // the office clock as a local date (the demo day's office time is UTC)
  toast: (t: Toast) => void;
  heard: (msg: ChatMessage, author: string) => void; // a chat line went by ("that's what she said")
};

export const PLAIN_MODE: DelightMode = { toby: true, jokes: false, ambient: false, eggs: false, sounds: false, motion: true, trips: false };
const NOTHING = new Map<string, never>();

export const PLAIN: DelightValue = {
  mode: PLAIN_MODE, dundies: { phase: 'loading' }, trophies: NOTHING, trips: NOTHING, unattributed: [], daylight: null, nodding: false,
  officeNow: () => Date.now(), wallClock: () => new Date(), toast: () => undefined, heard: () => undefined,
};

export const DelightContext = createContext<DelightValue>(PLAIN);
export const useDelight = (): DelightValue => useContext(DelightContext);
