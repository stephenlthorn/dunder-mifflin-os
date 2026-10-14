// What the delight layer adds to the map's words: an idle bot's chip says where it went, and Creed's chip and label
// say what he knows (plainly, in Toby mode). Labels never change for trips, so a bot is always found by its status.
import type { ChipInfo } from '../map/Overlay';
import type { Occupant } from '../map/SeatView';
import { TRIP_WORDS, type TripKind } from './ambient/trips';
import { CREED_DESK } from './creed/CreedNote';
import { creedWords } from './creed/unattributed';

type Creed = { count: number; toby: boolean };

export function decorateChips(chips: readonly ChipInfo[], trips: ReadonlyMap<string, TripKind>, creed: Creed): readonly ChipInfo[] {
  if (!trips.size && !creed.count) return chips;
  return chips.map((c) => {
    const trip = trips.get(c.personId);
    if (trip) return { ...c, text: `Idle · ${TRIP_WORDS[trip]}` };
    if (c.personId === CREED_DESK && creed.count) return { ...c, text: creedWords(creed.count, creed.toby).chip };
    return c;
  });
}

export function decorateOccupants(occupants: ReadonlyMap<string, Occupant>, creed: Creed): ReadonlyMap<string, Occupant> {
  if (!creed.count) return occupants;
  return new Map([...occupants].map(([seatId, o]) => [seatId, o.person.id === CREED_DESK ? { ...o, label: `${o.label} — ${creedWords(creed.count, creed.toby).label}` } : o]));
}
