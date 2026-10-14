import { describe, expect, it } from 'vitest';
import { DEFAULT_SEATS, ROSTER, isBotProfile, personForProfile, profileForPerson, rosterEntry } from '../src/roster.ts';
import { loadPeople } from '../src/people.ts';
import { SEATS, STAFF, toPerson } from '../../shared/office.ts';
import { GROUP_ROOMS, HERMES_ROOM_NAMES, hermesRooms, roomById } from '../src/rooms.ts';
import { buildSnapshot } from '../src/domain/snapshot.ts';
import type { HermesState } from '../src/hermes/types.ts';

const NOW = 1_800_000_000;
const QUIET: HermesState = {
  recordedAt: new Date(NOW * 1000).toISOString(), gateway: null, telegram: [], chatNames: {},
  kanban: { tasks: [], runs: [], subs: [], links: [] }, sessions: [], cron: [], personas: {},
};

const AREAS = ['lobby', 'reception', 'conference', 'michael', 'bullpen', 'kitchen', 'breakroom', 'restrooms', 'annex', 'warehouse'];

describe('roster (profile -> person)', () => {
  it('maps every Hermes bot of the example roster to its Office person', () => {
    expect(personForProfile('chief')).toBe('pam');
    expect(personForProfile('cmo')).toBe('michael');
    expect(personForProfile('campaigns')).toBe('dwight');
    expect(personForProfile('cfo')).toBe('angela');
    expect(personForProfile('teacher')).toBe('oscar');
    expect(personForProfile('social')).toBe('kelly');
    expect(personForProfile('skool')).toBe('andy');
    expect(personForProfile('ai-strategist')).toBe('ryan');
    expect(personForProfile('strategist')).toBe('david');
    expect(personForProfile('tech')).toBe('sadiq');
    expect(personForProfile('general')).toBe('jarvis');
    expect(personForProfile('health')).toBe('ira');
    expect(rosterEntry('health')).toMatchObject({ personId: 'ira', role: 'Personal health' });
    expect(DEFAULT_SEATS.ira).toEqual({ adapter: 'hermes', agent: 'health' });
    expect(ROSTER).toHaveLength(12);
  });

  it('is a two-way, one-to-one mapping', () => {
    for (const entry of ROSTER) {
      expect(profileForPerson(entry.personId)).toBe(entry.profile);
      expect(rosterEntry(entry.profile)).toEqual(entry);
    }
    expect(new Set(ROSTER.map((e) => e.personId)).size).toBe(ROSTER.length);
  });

  it('only accepts known profile keys', () => {
    expect(isBotProfile('tech')).toBe(true);
    expect(isBotProfile('stamford')).toBe(false);
    expect(isBotProfile('../tech')).toBe(false);
    expect(isBotProfile(42)).toBe(false);
    expect(personForProfile('jan')).toBeUndefined();
  });

  it('gives every bot a desk in an area of the floor plan', () => {
    for (const entry of ROSTER) {
      const seatId = STAFF.find((s) => s.id === entry.personId)?.seatId;
      expect(AREAS, entry.profile).toContain(SEATS.find((s) => s.id === seatId)?.areaId);
    }
  });
});

describe('people seam (shared/office.ts)', () => {
  const people = loadPeople();

  it('lists the full office staff (23 people) with unique ids and seats', () => {
    expect(people).toHaveLength(23);
    expect(new Set(people.map((p) => p.id)).size).toBe(23);
    expect(new Set(people.map((p) => p.seatId)).size).toBe(23);
  });

  it('takes every person from STAFF + toPerson, minus `bot` (the snapshot overlays it)', () => {
    const expected = STAFF.map((s) => {
      const { bot: _bot, ...rest } = toPerson(s);
      return rest;
    });
    expect(people).toEqual(expected);
    for (const p of people) expect(p).not.toHaveProperty('bot');
  });

  it('seats everyone on a real seat from the floor plan', () => {
    const seatIds = new Set(SEATS.map((s) => s.id));
    for (const p of people) expect(seatIds.has(p.seatId), p.id).toBe(true);
  });

  it('has a person for every roster entry', () => {
    const ids = new Set(people.map((p) => p.id));
    for (const entry of ROSTER) expect(ids.has(entry.personId)).toBe(true);
  });

  it('agrees with the server roster on who is which bot', () => {
    const shared = STAFF.flatMap((s) => (s.bot ? [[s.bot.profile, s.id]] : [])).sort();
    const server = ROSTER.map((e) => [e.profile, e.personId]).sort();
    expect(shared).toEqual(server);
  });

  it('is frozen, people and looks (no shared mutable state)', () => {
    expect(Object.isFrozen(people)).toBe(true);
    for (const p of people) {
      expect(Object.isFrozen(p)).toBe(true);
      expect(Object.isFrozen(p.look)).toBe(true);
    }
  });

  it('does not hand out STAFF objects (mutating a person cannot touch shared data)', () => {
    const pam = people.find((p) => p.id === 'pam');
    expect(pam?.look).not.toBe(STAFF.find((s) => s.id === 'pam')?.look);
  });
});

describe('rooms', () => {
  const people = loadPeople();
  const rooms = buildSnapshot(QUIET, people, NOW).rooms;

  it('defines the seven Hermes group rooms with their map locations', () => {
    const byId = Object.fromEntries(GROUP_ROOMS.map((r) => [r.id, r]));
    expect(byId.ops).toMatchObject({ areaId: 'conference', kind: 'ops', leadProfile: 'tech' });
    expect(byId.council).toMatchObject({ areaId: 'conference', kind: 'team', leadProfile: 'chief' });
    expect(byId.hq).toMatchObject({ areaId: 'reception', leadProfile: 'chief' });
    expect(byId.content).toMatchObject({ areaId: 'annex', leadProfile: 'social' });
    expect(byId.outreach).toMatchObject({ areaId: 'bullpen', leadProfile: 'campaigns' });
    expect(byId.skool).toMatchObject({ areaId: 'breakroom', leadProfile: 'skool' });
    expect(byId.rnd).toMatchObject({ areaId: 'warehouse', leadProfile: 'tech' });
    expect(HERMES_ROOM_NAMES['R&D']).toBe('rnd');
  });

  it('adds a direct-line room per bot at that bot\'s desk area', () => {
    const dm = rooms.find((r) => r.id === 'dm-campaigns');
    expect(dm).toMatchObject({ kind: 'dm', areaId: 'bullpen', memberIds: ['dwight'] });
    expect(rooms.find((r) => r.id === 'dm-health')).toMatchObject({ areaId: 'kitchen', memberIds: ['ira'] });
    expect(rooms.find((r) => r.id === 'dm-strategist')).toMatchObject({ areaId: 'lobby', memberIds: ['david'] });
    expect(rooms.filter((r) => r.kind === 'dm')).toHaveLength(12);
  });

  it('lists council members as people ids', () => {
    const council = rooms.find((r) => r.id === 'council');
    expect(council?.memberIds).toEqual(['pam', 'sadiq', 'david', 'ryan', 'michael', 'angela']);
  });

  it('only marks a room as a Hermes room when a chat was found for it', () => {
    const linked = hermesRooms([{ roomId: 'ops', chatKey: 'c_x', profiles: ['tech', 'campaigns', 'stamford'] }]);
    expect(linked.find((r) => r.id === 'ops')).toMatchObject({ hermesRoom: 'Ops', memberAgentIds: ['tech', 'campaigns'] });
    expect(linked.find((r) => r.id === 'hq')?.hermesRoom).toBeUndefined();
  });

  it('every member id is a real person', () => {
    const ids = new Set(people.map((p) => p.id));
    for (const room of rooms) for (const m of room.memberIds) expect(ids.has(m)).toBe(true);
  });

  it('looks rooms up by id, rejecting unknown ids', () => {
    expect(roomById('ops')?.leadProfile).toBe('tech');
    expect(roomById('dm-general')?.leadProfile).toBe('general');
    expect(roomById('dm-nobody')).toBeUndefined();
    expect(roomById('__proto__')).toBeUndefined();
  });
});
