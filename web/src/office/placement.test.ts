import { describe, expect, it } from 'vitest';
import type { Person, Presence, Room } from '@shared/contract';
import type { Seat } from '@shared/office';
import { placePeople } from './placement';

const look = { skin: '#fff', hair: '#000', hairStyle: 'short' as const, shirt: '#fff' };
const person = (id: string, seatId: string): Person => ({ id, name: id, title: '', seatId, bot: { profile: id, role: '' }, look });
const seat = (id: string, areaId: string, kind: Seat['kind'] = 'desk'): Seat => ({ id, areaId, x: 1, y: 1, facing: 's', kind, chair: 'office' });

const seats: Seat[] = [
  seat('seat.a', 'bullpen'), seat('seat.b', 'bullpen'), seat('seat.c', 'reception'),
  seat('conf.1', 'conference', 'meeting'), seat('conf.2', 'conference', 'meeting'),
  seat('spare.1', 'bullpen', 'spare'),
];
const rooms: Room[] = [
  { id: 'ops', name: 'Ops', areaId: 'conference', kind: 'ops', memberIds: [] },
  { id: 'council', name: 'Council', areaId: 'conference', kind: 'team', memberIds: [] },
  { id: 'hq', name: 'HQ', areaId: 'reception', kind: 'team', memberIds: [] },
];
const where = (people: Person[], presence: Record<string, Presence>) =>
  Object.fromEntries(placePeople(people, presence, rooms, seats).map((p) => [p.personId, p.seatId]));

describe('placePeople', () => {
  it('seats everyone at their own desk by default', () => {
    expect(where([person('a', 'seat.a'), person('b', 'seat.b')], {})).toEqual({ a: 'seat.a', b: 'seat.b' });
  });

  it('draws people whose presence has a room in that room, in meeting-seat order', () => {
    const people = [person('a', 'seat.a'), person('b', 'seat.b')];
    const presence: Record<string, Presence> = { a: { status: 'meeting', roomId: 'council' }, b: { status: 'working', roomId: 'ops' } };
    expect(where(people, presence)).toEqual({ a: 'conf.1', b: 'conf.2' });
    expect(placePeople(people, presence, rooms, seats).every((p) => p.away)).toBe(true);
  });

  it('sends a meeting with no room to the ops room', () => {
    expect(where([person('a', 'seat.a')], { a: { status: 'meeting' } })).toEqual({ a: 'conf.1' });
  });

  it('keeps people at their desk when the room is in their own area or unknown', () => {
    expect(where([person('c', 'seat.c')], { c: { status: 'working', roomId: 'hq' } })).toEqual({ c: 'seat.c' });
    expect(where([person('a', 'seat.a')], { a: { status: 'working', roomId: 'nowhere' } })).toEqual({ a: 'seat.a' });
  });

  it('leaves overflow at their desks when the meeting seats run out', () => {
    const people = ['a', 'b', 'c'].map((id) => person(id, `seat.${id}`));
    const presence = Object.fromEntries(people.map((p) => [p.id, { status: 'meeting' as const, roomId: 'ops' }]));
    expect(where(people, presence)).toEqual({ a: 'conf.1', b: 'conf.2', c: 'seat.c' });
  });

  it('gives unknown or double-booked seats a spare desk and drops people once spares run out', () => {
    const people = [person('a', 'seat.a'), person('x', 'seat.a'), person('y', 'seat.missing')];
    expect(where(people, {})).toEqual({ a: 'seat.a', x: 'spare.1' });
  });
});

describe('movedPeople', () => {
  it('reports people whose seat changed since the last placement, and nobody on first load', async () => {
    const { movedPeople } = await import('./placement');
    const now = [{ personId: 'a', seatId: 'conf.1', away: true }, { personId: 'b', seatId: 'seat.b', away: false }];
    expect(movedPeople(null, now)).toEqual(new Set());
    const before = new Map([['a', 'seat.a'], ['b', 'seat.b']]);
    expect(movedPeople(before, now)).toEqual(new Set(['a']));
  });
});
