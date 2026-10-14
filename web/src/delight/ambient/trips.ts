// Ambient life: now and then an idle bot gets up for coffee, the vending machine or the water cooler, and comes back
// a few minutes later. Rare (about one minute in twenty), seeded (the same minute always looks the same) and only for
// bots that really are idle; never in Toby mode or with reduced motion (see delight/mode.ts). Pure.
import type { Seat } from '@shared/office';
import { pick, rng } from '@shared/demo/random';
import type { Placement } from '../../office/placement';

export type TripKind = 'coffee' | 'vending' | 'cooler';
export type Trip = { kind: TripKind; start: number; end: number };
export type Spot = { kind: TripKind; seat: Seat };

export const TRIP_SLOT_MS = 20 * 60_000;
const CHANCE = 0.25;
const KINDS: readonly TripKind[] = ['coffee', 'vending', 'cooler'];

const spot = (kind: TripKind, id: string, areaId: string, x: number, y: number, facing: Seat['facing']): Spot =>
  ({ kind, seat: { id: `spot.${kind}.${id}`, areaId, x, y, facing, kind: 'spot', chair: 'none' } });

/** Where they stand: at the kitchen counter's coffee maker, at the break room's machines and by two water coolers. */
export const SPOTS: readonly Spot[] = Object.freeze([
  spot('coffee', '1', 'kitchen', 42.5, 20.2, 'n'),
  spot('coffee', '2', 'kitchen', 44.3, 20.2, 'n'),
  spot('vending', '1', 'breakroom', 66.6, 32.4, 'n'),
  spot('vending', '2', 'breakroom', 70.6, 32.6, 'n'),
  spot('cooler', '1', 'kitchen', 52.1, 14.1, 'e'),
  spot('cooler', '2', 'annex', 70.1, 12.1, 'n'),
]);

export const TRIP_WORDS: Readonly<Record<TripKind, string>> = { coffee: 'getting coffee', vending: 'at the vending machine', cooler: 'at the water cooler' };

/** The trip a person is on at a moment, if any: at most one per 20-minute slot, 3 to 5 minutes long. */
export function tripAt(personId: string, nowMs: number, seed = 1): Trip | null {
  const slot = Math.floor(nowMs / TRIP_SLOT_MS);
  const next = rng(seed, 'trip', personId, slot);
  if (next() >= CHANCE) return null;
  const kind = pick(KINDS, next) ?? 'coffee';
  const length = (3 + Math.floor(next() * 3)) * 60_000;
  const start = slot * TRIP_SLOT_MS + Math.floor(next() * (TRIP_SLOT_MS - length));
  return nowMs >= start && nowMs < start + length ? { kind, start, end: start + length } : null;
}

export function tripsFor(idleIds: readonly string[], nowMs: number, seed = 1): Map<string, TripKind> {
  return new Map(idleIds.flatMap((id) => {
    const trip = tripAt(id, nowMs, seed);
    return trip ? [[id, trip.kind] as const] : [];
  }));
}

/** People on a trip leave their desk for a free spot of that kind (or stay put when every spot is taken). */
export function withTrips(placements: readonly Placement[], trips: ReadonlyMap<string, TripKind>): Placement[] {
  const taken = new Set<string>();
  return placements.map((p) => {
    const kind = trips.get(p.personId);
    const free = kind && !p.away ? SPOTS.find((s) => s.kind === kind && !taken.has(s.seat.id)) : undefined;
    if (!free) return p;
    taken.add(free.seat.id);
    return { personId: p.personId, seatId: free.seat.id, away: true };
  });
}
