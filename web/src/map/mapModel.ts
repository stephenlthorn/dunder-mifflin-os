// Derive what the map draws from a snapshot: placements, occupants per seat, status chips and room signs.
import type { OfficeSnapshot, Person, Presence, Room } from '@shared/contract';
import { OFFICE, type OfficeData, areaRects } from '@shared/office';
import { type Bounds, Z_PX, boundsOf, project, scaleAt } from '../iso/projection';
import { type Placement, placePeople } from '../office/placement';
import { chipText, personLabel, presenceFor } from '../office/status';
import type { ChipInfo, SignInfo } from './Overlay';
import type { Occupant } from './SeatView';
import { shortName } from '../office/names';
import { HR_DESK, askingIds } from '../office/needsYou';
import { receptionPhoneSpot } from './parts/referenceParts';

const ROOM_ORDER: Record<Room['kind'], number> = { ops: 0, team: 1, common: 2, dm: 3 };

/** Rooms you can open from an area's sign: everything but direct lines, Ops first. */
export function areaRooms(rooms: readonly Room[], areaId: string): Room[] {
  return rooms.filter((r) => r.areaId === areaId && r.kind !== 'dm').sort((a, b) => ROOM_ORDER[a.kind] - ROOM_ORDER[b.kind]);
}

export function placementsFor(s: OfficeSnapshot, office: OfficeData = OFFICE): Placement[] {
  return placePeople(s.people, s.presence, s.rooms, office.seats);
}

/** A person's map label, plus "needs you" when an approval waits on them, and the inbox for Toby's HR desk. */
function mapLabel(s: OfficeSnapshot, person: Person, presence: Presence, asking: boolean): string {
  const base = personLabel(person, presence);
  if (person.id === HR_DESK) {
    const waiting = s.approvals?.length ?? 0;
    return `${base} — HR · Approvals${waiting ? `, ${waiting} waiting` : ''}`;
  }
  return asking && presence.status !== 'needs-input' ? `${base} — needs you` : base;
}

export function occupantsBySeat(
  s: OfficeSnapshot, placements: readonly Placement[], walking: ReadonlySet<string> = new Set(), hidden: ReadonlySet<string> = new Set(),
): Map<string, Occupant> {
  const people = new Map(s.people.map((p) => [p.id, p]));
  const askers = askingIds(s);
  return new Map(placements.flatMap((pl) => {
    const person = people.get(pl.personId);
    if (!person) return [];
    const presence = presenceFor(person, s.presence);
    const asking = askers.has(person.id) && Boolean(person.bot);
    const occupant = {
      person, presence, label: mapLabel(s, person, presence, asking), away: pl.away, walking: walking.has(person.id), dimmed: hidden.has(person.id), asking,
    };
    return [[pl.seatId, occupant]];
  }));
}

/** Where Pam's reception phone is drawn, on screen at map scale 1, with the perspective scale there. */
export function phoneSpot(office: OfficeData = OFFICE): { x: number; y: number; k: number } | null {
  const desk = office.furniture.find((f) => f.kind === 'reception-desk');
  if (!desk) return null;
  const spot = receptionPhoneSpot(desk);
  return { ...project(spot), k: scaleAt(spot) };
}

export function chipsFor(s: OfficeSnapshot, placements: readonly Placement[], office: OfficeData = OFFICE): ChipInfo[] {
  const seats = new Map(office.seats.map((seat) => [seat.id, seat]));
  const people = new Map(s.people.map((p) => [p.id, p]));
  const roomName = new Map(s.rooms.map((r) => [r.id, r.name]));
  return placements.flatMap((pl) => {
    const seat = seats.get(pl.seatId);
    const person = people.get(pl.personId);
    if (!seat || !person) return [];
    const presence = presenceFor(person, s.presence);
    const p = project({ x: seat.x, y: seat.y });
    const k = scaleAt(seat);
    const lift = (seat.chair === 'forklift' ? 1.15 : 0.92) * Z_PX;
    return [{
      personId: person.id,
      x: p.x + (seat.facing === 'w' ? -k : k),
      y: p.y - (lift + 36) * k,
      name: shortName(person.name),
      text: chipText(presence, presence.roomId ? roomName.get(presence.roomId) : undefined),
      status: presence.status,
      figure: { x: p.x + k, y: p.y - (lift + 4) * k, w: 22 * k, h: 30 * k },
    }];
  });
}

export function signsFor(s: OfficeSnapshot, office: OfficeData = OFFICE): SignInfo[] {
  return office.areas.map((area) => {
    const rooms = areaRooms(s.rooms, area.id);
    const label = rooms.length ? `${area.name} — ${rooms.map((r) => `${r.name} room`).join(', ')}` : area.name;
    return { area, rooms: rooms.map((r) => ({ id: r.id, name: r.name })), label };
  });
}

/** Screen-space bounds of the whole drawing (floors plus the tallest furniture), padded for chips and signs. */
export function contentBounds(office: OfficeData = OFFICE): Bounds {
  const pts = office.areas.flatMap(areaRects).flatMap(({ x, y, w, h }) => {
    return [0, 3.6].flatMap((z) => [project({ x, y, z }), project({ x: x + w, y, z }), project({ x, y: y + h, z }), project({ x: x + w, y: y + h, z })]);
  });
  const b = boundsOf(pts);
  return { minX: b.minX - 10, minY: b.minY - 40, maxX: b.maxX + 10, maxY: b.maxY + 24 };
}
