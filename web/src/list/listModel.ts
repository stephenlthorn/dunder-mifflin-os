// The mobile list: everyone grouped by where they are now (Reception, Bullpen, …), most urgent first. Pure.
import type { OfficeSnapshot, Person, Presence, Room } from '@shared/contract';
import { OFFICE, type OfficeData } from '@shared/office';
import { areaRooms, placementsFor } from '../map/mapModel';
import { type FleetFilter, matchesFilter } from '../office/filters';
import { presenceFor } from '../office/status';

export type ListRow = { person: Person; presence: Presence; where?: string };
export type ListGroup = { areaId: string; name: string; rooms: Room[]; rows: ListRow[] };

const AREA_ORDER = ['reception', 'bullpen', 'michael', 'conference', 'kitchen', 'annex', 'breakroom', 'stairwell', 'restrooms', 'lobby', 'warehouse'];
const RANK: Record<Presence['status'], number> = { 'needs-input': 0, error: 1, working: 2, meeting: 3, idle: 4, offline: 5, 'no-bot': 6 };
const rank = (r: ListRow) => RANK[r.presence.status];
const orderOf = (id: string) => (AREA_ORDER.includes(id) ? AREA_ORDER.indexOf(id) : AREA_ORDER.length);

export function listGroups(s: OfficeSnapshot, filter: FleetFilter, office: OfficeData = OFFICE): ListGroup[] {
  const seatArea = new Map(office.seats.map((seat) => [seat.id, seat.areaId]));
  const roomName = new Map(s.rooms.map((r) => [r.id, r.name]));
  const people = new Map(s.people.map((p) => [p.id, p]));
  const rows = placementsFor(s, office).flatMap((pl) => {
    const person = people.get(pl.personId);
    const areaId = seatArea.get(pl.seatId);
    if (!person || !areaId) return [];
    const presence = presenceFor(person, s.presence);
    if (!matchesFilter(person, presence, filter)) return [];
    const where = pl.away && pl.roomId ? `In ${roomName.get(pl.roomId) ?? 'a meeting'}` : undefined;
    return [{ areaId, row: { person, presence, ...(where ? { where } : {}) } }];
  });
  return [...office.areas]
    .sort((a, b) => orderOf(a.id) - orderOf(b.id))
    .map((area) => ({
      areaId: area.id,
      name: area.name,
      rooms: areaRooms(s.rooms, area.id),
      rows: rows.filter((r) => r.areaId === area.id).map((r) => r.row)
        .sort((a, b) => rank(a) - rank(b) || a.person.name.localeCompare(b.person.name)),
    }))
    .filter((g) => g.rows.length > 0 || (filter === 'all' && g.rooms.length > 0));
}
