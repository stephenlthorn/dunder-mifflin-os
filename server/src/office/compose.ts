// Readings from every adapter + the seating -> the OfficeSnapshot the browser gets. Pure: no I/O.
// Agent ids become person ids here and nowhere else. Free text is scrubbed again on the way out (scrubText is
// idempotent), so an adapter that forgets cannot leak a token or a home path to the browser.
import type { AgentCapabilities, OfficeSnapshot, Person, Presence, Room, ScheduledJob, Task } from '../../../shared/contract.ts';
import type { AdapterSnapshot, AgentAdapter, AgentInfo, AgentRoom, AgentTask } from '../adapters/types.ts';
import type { EpochSeconds } from '../hermes/types.ts';
import type { BasePerson } from '../people.ts';
import { NO_BOT, toIso } from '../domain/presence.ts';
import { scrubText } from '../domain/scrub.ts';
import type { Seat, Seating } from './seating.ts';
import { tempPerson } from './temps.ts';
import { composeApprovals, surfaceApprovals } from './composeApprovals.ts';

export type AdapterSummary = Pick<AgentAdapter, 'id' | 'kind' | 'label' | 'capabilities'>;
export type AdapterReading = { readonly adapter: AdapterSummary; readonly snapshot: AdapterSnapshot };
export type ComposeContext = {
  readonly people: ReadonlyArray<BasePerson>;
  readonly keepName: ReadonlySet<string>;
  readonly seatAreas: ReadonlyMap<string, string>; // seat id -> area id
  readonly now: EpochSeconds;
};
export type Composed = { readonly snapshot: OfficeSnapshot; readonly roomOwners: ReadonlyMap<string, string> };

const MAX_TASKS = 200;
/** Adapters whose agent names are characters (Hermes personas are Office names): they rename the character they sit as. */
const PERSONA_KINDS: ReadonlySet<string> = new Set(['hermes']);
const DEFAULT_ROOM_AREA = 'conference';
const NOT_REPORTING: Presence = Object.freeze({ status: 'offline', activity: 'Not reporting yet' });

const scrubPresence = (p: Presence): Presence => (p.activity === undefined ? { ...p } : { ...p, activity: scrubText(p.activity) });

function agentOf(reading: AdapterReading | undefined, agentId: string): AgentInfo | undefined {
  return reading?.snapshot.agents.find((a) => a.id === agentId);
}

/** The adapter's flags, minus any this agent turned off (a webhook agent without a control callback). */
function agentCapabilities(reading: AdapterReading, agentId: string): AgentCapabilities {
  const off = reading.snapshot.capabilities?.[agentId] ?? {};
  const flags = Object.entries(reading.adapter.capabilities).map(([k, v]) => [k, v === true && off[k as keyof AgentCapabilities] !== false]);
  return Object.fromEntries(flags) as AgentCapabilities;
}

function botFor(seat: Seat, reading: AdapterReading): NonNullable<Person['bot']> {
  const agent = agentOf(reading, seat.agentId);
  const role = seat.role ?? agent?.role ?? `${reading.adapter.label} agent`;
  return { profile: seat.agentId, role: scrubText(role), adapter: reading.adapter.id, capabilities: agentCapabilities(reading, seat.agentId) };
}

function seatedPerson(p: BasePerson, seat: Seat, reading: AdapterReading, keepName: ReadonlySet<string>): Person {
  const bot = botFor(seat, reading);
  const ownName = agentOf(reading, seat.agentId)?.name;
  const persona = ownName === undefined ? undefined : scrubText(ownName);
  const renames = PERSONA_KINDS.has(reading.adapter.kind) && !keepName.has(p.id);
  if (renames) return { ...p, name: persona ?? p.name, bot };
  return persona && persona !== p.name ? { ...p, bot, persona } : { ...p, bot };
}

function composePeople(readings: ReadonlyMap<string, AdapterReading>, seating: Seating, ctx: ComposeContext): Person[] {
  const staff = ctx.people.map((p): Person => {
    const seat = seating.staff.get(p.id);
    const reading = seat && readings.get(seat.adapterId);
    return seat && reading ? seatedPerson(p, seat, reading, ctx.keepName) : { ...p };
  });
  const temps = seating.temps.flatMap((t): Person[] => {
    const reading = readings.get(t.adapterId);
    if (!reading) return [];
    const name = scrubText(agentOf(reading, t.agentId)?.name ?? t.agentId);
    return [{ ...tempPerson(t.personId, t.seatId, name, reading.adapter.label), bot: botFor(t, reading) }];
  });
  return [...staff, ...temps];
}

function composePresence(people: ReadonlyArray<Person>, readings: ReadonlyMap<string, AdapterReading>, seating: Seating): Record<string, Presence> {
  const seatOf = new Map([...seating.staff.values(), ...seating.temps].map((s) => [s.personId, s]));
  return Object.fromEntries(people.map((p): [string, Presence] => {
    const seat = seatOf.get(p.id);
    if (!seat) return [p.id, NO_BOT];
    const reported = readings.get(seat.adapterId)?.snapshot.presence[seat.agentId];
    return [p.id, reported ? scrubPresence(reported) : NOT_REPORTING];
  }));
}

type RoomContext = { readonly seating: Seating; readonly people: ReadonlyMap<string, Person>; readonly seatAreas: ReadonlyMap<string, string> };

function composeRoom(room: AgentRoom, reading: AdapterReading, ctx: RoomContext): Room | null {
  const memberIds = room.memberAgentIds.flatMap((a) => {
    const id = ctx.seating.personOf(reading.adapter.id, a);
    return id ? [id] : [];
  });
  const first = ctx.people.get(memberIds[0] ?? '');
  if (room.kind === 'dm' && !first) return null;
  const name = room.kind === 'dm' && first ? `Direct line: ${first.name}` : scrubText(room.name);
  const deskArea = first ? ctx.seatAreas.get(first.seatId) : undefined;
  const areaId = room.areaId ?? (room.kind === 'dm' ? deskArea : undefined) ?? DEFAULT_ROOM_AREA;
  return {
    id: room.id, name, areaId, kind: room.kind,
    ...(room.hermesRoom === undefined ? {} : { hermesRoom: room.hermesRoom }),
    memberIds, adapter: reading.adapter.id, capabilities: { ...reading.adapter.capabilities },
  };
}

function composeRooms(readings: ReadonlyArray<AdapterReading>, ctx: RoomContext): { rooms: Room[]; owners: Map<string, string> } {
  const owners = new Map<string, string>();
  const rooms = readings.flatMap((reading) => reading.snapshot.rooms.flatMap((room): Room[] => {
    if (owners.has(room.id)) return [];
    const composed = composeRoom(room, reading, ctx);
    if (!composed) return [];
    owners.set(room.id, reading.adapter.id);
    return [composed];
  }));
  return { rooms, owners };
}

/** An adapter task with its owner agent turned into the person at that agent's desk. */
export function toTask(t: AgentTask, adapterId: string, seating: Seating): Task {
  const { ownerAgentId, ...rest } = t;
  const ownerId = ownerAgentId === undefined ? undefined : seating.personOf(adapterId, ownerAgentId);
  return { ...rest, title: scrubText(t.title), ...(ownerId ? { ownerId } : {}) };
}

function composeTasks(readings: ReadonlyArray<AdapterReading>, seating: Seating): Task[] {
  return readings
    .flatMap((reading) => reading.snapshot.tasks.map((t) => toTask(t, reading.adapter.id, seating)))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, MAX_TASKS);
}

function composeJobs(readings: ReadonlyArray<AdapterReading>, seating: Seating): Record<string, ScheduledJob[]> {
  return readings.reduce<Record<string, ScheduledJob[]>>((acc, reading) =>
    Object.entries(reading.snapshot.jobs ?? {}).reduce((inner, [agentId, jobs]) => {
      const personId = seating.personOf(reading.adapter.id, agentId);
      return personId ? { ...inner, [personId]: [...(inner[personId] ?? []), ...jobs.map((j) => ({ ...j }))] } : inner;
    }, acc), {});
}

export function composeOffice(readings: ReadonlyArray<AdapterReading>, seating: Seating, ctx: ComposeContext): Composed {
  const byId = new Map(readings.map((r) => [r.adapter.id, r]));
  const people = composePeople(byId, seating, ctx);
  const { rooms, owners } = composeRooms(readings, { seating, people: new Map(people.map((p) => [p.id, p])), seatAreas: ctx.seatAreas });
  const approvals = composeApprovals(readings, seating, people);
  const snapshot: OfficeSnapshot = {
    generatedAt: toIso(ctx.now),
    people,
    presence: surfaceApprovals(composePresence(people, byId, seating), approvals),
    rooms,
    tasks: composeTasks(readings, seating),
    jobs: composeJobs(readings, seating),
    adapters: readings.map((r) => ({
      id: r.adapter.id, kind: r.adapter.kind, label: r.adapter.label, capabilities: { ...r.adapter.capabilities }, agents: r.snapshot.agents.length,
    })),
    approvals,
  };
  return { snapshot, roomOwners: owners };
}
