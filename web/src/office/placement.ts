// Decide which seat each person is drawn in: their own desk, or a meeting seat in the area of the room they are in.
import type { Person, Presence, Room } from '@shared/contract';
import type { Seat } from '@shared/office';

export type Placement = { personId: string; seatId: string; away: boolean; roomId?: string };

function targetRoom(p: Presence | undefined, rooms: readonly Room[]): Room | undefined {
  const roomId = p?.roomId ?? (p?.status === 'meeting' ? rooms.find((r) => r.kind === 'ops')?.id : undefined);
  return roomId ? rooms.find((r) => r.id === roomId) : undefined;
}

export function placePeople(
  people: readonly Person[],
  presence: Readonly<Record<string, Presence>>,
  rooms: readonly Room[],
  seats: readonly Seat[],
): Placement[] {
  const seatById = new Map(seats.map((s) => [s.id, s]));
  const taken = new Set<string>();
  const claim = (seatId: string) => taken.add(seatId);

  // 1. home seats (first come, first served), so meeting-goers keep their desk reserved
  const home = new Map<string, Seat>();
  for (const person of people) {
    const own = seatById.get(person.seatId);
    if (own && !taken.has(own.id)) {
      home.set(person.id, own);
      claim(own.id);
    }
  }
  for (const person of people) {
    if (home.has(person.id)) continue;
    const spare = seats.find((s) => s.kind === 'spare' && !taken.has(s.id));
    if (spare) {
      home.set(person.id, spare);
      claim(spare.id);
    }
  }

  // 2. people in a room elsewhere move to that area's meeting seats, in data order
  return people.flatMap((person): Placement[] => {
    const desk = home.get(person.id);
    if (!desk) return [];
    const room = targetRoom(presence[person.id], rooms);
    if (room && room.areaId !== desk.areaId) {
      const seat = seats.find((s) => s.kind === 'meeting' && s.areaId === room.areaId && !taken.has(s.id));
      if (seat) {
        claim(seat.id);
        return [{ personId: person.id, seatId: seat.id, away: true, roomId: room.id }];
      }
    }
    return [{ personId: person.id, seatId: desk.id, away: false }];
  });
}

/** People whose seat differs from the previous placement (they get the walk/fade transition). */
export function movedPeople(previous: ReadonlyMap<string, string> | null, placements: readonly Placement[]): Set<string> {
  if (!previous) return new Set();
  return new Set(placements.filter((p) => previous.has(p.personId) && previous.get(p.personId) !== p.seatId).map((p) => p.personId));
}
