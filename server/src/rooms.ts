// The Hermes rooms of the example roster (docs/ARCHITECTURE.md, "Rooms and areas"). Telegram chat ids never live here:
// the live link between a room and its Telegram group is a RoomChat with an opaque chat key. Members are profile
// keys; the office maps them to people and puts each direct line at its bot's desk.
import type { Room } from '../../shared/contract.ts';
import type { AgentRoom } from './adapters/types.ts';
import type { RoomChat } from './hermes/types.ts';
import { ROSTER, rosterEntry } from './roster.ts';

export type RoomDef = {
  readonly id: string;
  readonly name: string;
  readonly hermesName: string; // the room's name inside Hermes prompts, e.g. 'R&D'
  readonly areaId?: string; // absent for a direct line: it sits at its bot's desk
  readonly kind: Room['kind'];
  readonly leadProfile: string;
  readonly memberProfiles: ReadonlyArray<string>;
};

function def(d: RoomDef): RoomDef {
  return Object.freeze({ ...d, memberProfiles: Object.freeze([...d.memberProfiles]) });
}

export const GROUP_ROOMS: ReadonlyArray<RoomDef> = Object.freeze([
  def({ id: 'ops', name: 'Ops', hermesName: 'Ops', areaId: 'conference', kind: 'ops', leadProfile: 'tech', memberProfiles: ['tech'] }),
  def({
    id: 'council', name: 'Council', hermesName: 'Council', areaId: 'conference', kind: 'team', leadProfile: 'chief',
    memberProfiles: ['chief', 'tech', 'strategist', 'ai-strategist', 'cmo', 'cfo'],
  }),
  def({ id: 'hq', name: 'HQ', hermesName: 'HQ', areaId: 'reception', kind: 'team', leadProfile: 'chief', memberProfiles: ['chief'] }),
  def({ id: 'content', name: 'Content', hermesName: 'Content', areaId: 'annex', kind: 'team', leadProfile: 'social', memberProfiles: ['social'] }),
  def({ id: 'outreach', name: 'Outreach', hermesName: 'Outreach', areaId: 'bullpen', kind: 'team', leadProfile: 'campaigns', memberProfiles: ['campaigns'] }),
  def({ id: 'skool', name: 'Skool', hermesName: 'Skool', areaId: 'breakroom', kind: 'team', leadProfile: 'skool', memberProfiles: ['skool'] }),
  def({ id: 'rnd', name: 'R&D', hermesName: 'R&D', areaId: 'warehouse', kind: 'team', leadProfile: 'tech', memberProfiles: ['tech', 'ai-strategist'] }),
]);

/** Room ids whose tasks are "shared" (drawn in the Conference Room). */
export const SHARED_ROOM_IDS: ReadonlySet<string> = new Set(['ops', 'council']);

/** Hermes room name (as written in channel prompts / group titles) -> room id. */
export const HERMES_ROOM_NAMES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(GROUP_ROOMS.map((r) => [r.hermesName, r.id])),
);

export function dmRoomId(profile: string): string {
  return `dm-${profile}`;
}

const DM_ROOMS: ReadonlyArray<RoomDef> = Object.freeze(
  ROSTER.map((e) => def({
    id: dmRoomId(e.profile), name: 'Direct line', hermesName: 'DM', kind: 'dm',
    leadProfile: e.profile, memberProfiles: [e.profile],
  })),
);

const ALL_ROOMS: ReadonlyMap<string, RoomDef> = new Map([...GROUP_ROOMS, ...DM_ROOMS].map((r) => [r.id, r]));

export function roomById(id: string): RoomDef | undefined {
  return ALL_ROOMS.get(id);
}

/** The Hermes rooms: group rooms (Hermes-linked when a chat was found for them) + one direct line per bot. */
export function hermesRooms(roomChats: ReadonlyArray<RoomChat>): AgentRoom[] {
  const linked = new Map(roomChats.map((rc) => [rc.roomId, rc]));
  const groups = GROUP_ROOMS.map((r): AgentRoom => {
    const chat = linked.get(r.id);
    const live = chat ? chat.profiles.filter((p) => !r.memberProfiles.includes(p) && rosterEntry(p)) : [];
    return {
      id: r.id, name: r.name, ...(r.areaId ? { areaId: r.areaId } : {}), kind: r.kind,
      ...(chat ? { hermesRoom: r.hermesName } : {}),
      memberAgentIds: [...r.memberProfiles, ...live],
    };
  });
  const dms = DM_ROOMS.map((r): AgentRoom => ({ id: r.id, name: r.name, kind: 'dm', hermesRoom: r.hermesName, memberAgentIds: [r.leadProfile] }));
  return [...groups, ...dms];
}
