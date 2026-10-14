// Where a winner's Dundie stands: on the desk in front of them, off to the side of the screen. World units; the
// caller projects it. Seats whose "desk" is somewhere else (an armchair, a stool at a cart) get their own spot.
import type { Seat } from '@shared/office';
import type { Vec3 } from '../../iso/projection';

const AHEAD: Record<Seat['facing'], [number, number]> = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] };
const SIDE: Record<Seat['facing'], [number, number]> = { n: [1, 0], s: [1, 0], e: [0, -1], w: [0, -1] };
const TOP = 1.5; // desk height

/** Per-seat overrides: [ahead, side, height]. */
const SPECIAL: Readonly<Record<string, readonly [number, number, number]>> = {
  'seat.david': [0, -1.6, 0.8], // the lobby's coffee table beside his armchair
  'seat.pam': [1.1, 0.6, 1.9], // the reception desk's counter
  'seat.sadiq': [1.4, 0.2, 1.5], // the IT cart
};

export function trophySpot(seat: Seat): Vec3 {
  const [ahead, side, z] = SPECIAL[seat.id] ?? [1.15, 0.85, TOP];
  const [ax, ay] = AHEAD[seat.facing];
  const [sx, sy] = SIDE[seat.facing];
  return { x: seat.x + ax * ahead + sx * side, y: seat.y + ay * ahead + sy * side, z };
}
