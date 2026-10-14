import { describe, expect, it } from 'vitest';
import type { Placement } from '../../office/placement';
import { SPOTS, TRIP_SLOT_MS, tripAt, tripsFor, withTrips } from './trips';

const T0 = Date.parse('2026-10-13T09:00:00.000Z');
const scan = (personId: string, seed = 1) => Array.from({ length: 24 * 60 }, (_, m) => tripAt(personId, T0 + m * 60_000, seed));

describe('tripAt (seeded, rare)', () => {
  it('is the same for the same person, minute and seed', () => {
    expect(scan('andy')).toEqual(scan('andy'));
    expect(scan('andy', 2)).not.toEqual(scan('andy', 1));
  });

  it('keeps an idle bot at its desk most of the time, with short trips of 3 to 5 minutes', () => {
    const minutes = scan('andy');
    const away = minutes.filter(Boolean).length;
    expect(away).toBeGreaterThan(0);
    expect(away / minutes.length).toBeLessThan(0.12);
    for (const t of minutes) if (t) expect(t.end - t.start).toBeGreaterThanOrEqual(3 * 60_000);
    for (const t of minutes) if (t) expect(t.end - t.start).toBeLessThanOrEqual(5 * 60_000);
    for (const t of minutes) if (t) expect(Math.floor(t.start / TRIP_SLOT_MS)).toBe(Math.floor((t.end - 1) / TRIP_SLOT_MS));
  });

  it('goes for coffee, to the vending machine or to the water cooler', () => {
    const kinds = new Set(['andy', 'oscar', 'kelly', 'ryan', 'david', 'jarvis'].flatMap((p) => scan(p).flatMap((t) => (t ? [t.kind] : []))));
    expect([...kinds].sort()).toEqual(['coffee', 'cooler', 'vending']);
  });
});

describe('tripsFor / withTrips', () => {
  const placements: Placement[] = [
    { personId: 'andy', seatId: 'seat.andy', away: false },
    { personId: 'oscar', seatId: 'seat.oscar', away: false },
    { personId: 'michael', seatId: 'seat.conf.s1', away: true, roomId: 'council' },
  ];

  it('only idle bots take trips', () => {
    const at = Array.from({ length: 1440 }, (_, m) => T0 + m * 60_000).find((t) => tripAt('andy', t));
    expect(at).toBeDefined();
    expect(tripsFor(['andy'], at!).get('andy')).toBe(tripAt('andy', at!)?.kind);
    expect(tripsFor([], at!).size).toBe(0);
  });

  it('moves a bot on a trip to a free spot of the right kind, and leaves meetings alone', () => {
    const moved = withTrips(placements, new Map([['andy', 'coffee'], ['oscar', 'coffee'], ['michael', 'vending']]));
    const coffee = SPOTS.filter((s) => s.kind === 'coffee').map((s) => s.seat.id);
    expect(moved[0]).toEqual({ personId: 'andy', seatId: coffee[0], away: true });
    expect(moved[1]).toEqual({ personId: 'oscar', seatId: coffee[1], away: true });
    expect(moved[2]).toBe(placements[2]);
    const crowd = withTrips([...placements, { personId: 'kelly', seatId: 'seat.kelly', away: false }], new Map([['andy', 'coffee'], ['oscar', 'coffee'], ['kelly', 'coffee']]));
    expect(crowd[3]).toEqual({ personId: 'kelly', seatId: 'seat.kelly', away: false }); // no spot left: stays put
  });

  it('spots stand on the floor (no chair) in the kitchen, the break room and by the coolers', () => {
    expect(SPOTS.every((s) => s.seat.chair === 'none' && s.seat.kind === 'spot')).toBe(true);
    expect(new Set(SPOTS.map((s) => s.seat.areaId))).toEqual(new Set(['kitchen', 'breakroom', 'annex']));
  });
});
