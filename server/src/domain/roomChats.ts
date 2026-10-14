// Which Telegram group (opaque chat key) is which room. Evidence, strongest first:
//  1. channel_prompts naming "<Room> room" (the lead's prompt counts double),
//  2. the Telegram group title ending in the room name ("Dunder Mifflin Ops"),
//  3. elimination: a lead with exactly one unexplained lead chat and one unresolved room it leads.
import type { RoomChat, TelegramRoomConfig } from '../hermes/types.ts';
import { GROUP_ROOMS, HERMES_ROOM_NAMES, roomById } from '../rooms.ts';

const TITLE_RE = /\b(HQ|Content|Outreach|Ops|R&D|Skool|Council)\s*$/;

type Votes = ReadonlyMap<string, ReadonlyMap<string, number>>; // chatKey -> roomId -> score

function addVote(votes: Map<string, Map<string, number>>, chatKey: string, roomId: string, weight: number): void {
  const forChat = votes.get(chatKey) ?? new Map<string, number>();
  forChat.set(roomId, (forChat.get(roomId) ?? 0) + weight);
  votes.set(chatKey, forChat);
}

function collectVotes(configs: ReadonlyArray<TelegramRoomConfig>, chatNames: Readonly<Record<string, string>>): Votes {
  const votes = new Map<string, Map<string, number>>();
  for (const c of configs) {
    for (const [chatKey, hint] of Object.entries(c.roomHints)) {
      const roomId = HERMES_ROOM_NAMES[hint];
      if (roomId) addVote(votes, chatKey, roomId, roomById(roomId)?.leadProfile === c.profile ? 2 : 1);
    }
  }
  for (const [chatKey, title] of Object.entries(chatNames)) {
    const name = TITLE_RE.exec(title.trim())?.[1];
    const roomId = name ? HERMES_ROOM_NAMES[name] : undefined;
    if (roomId) addVote(votes, chatKey, roomId, 1);
  }
  return votes;
}

function bestRoom(scores: ReadonlyMap<string, number>): { roomId: string; score: number } | undefined {
  const order = GROUP_ROOMS.map((r) => r.id);
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([roomId, score]) => ({ roomId, score }))[0];
}

function leads(configs: ReadonlyArray<TelegramRoomConfig>, roomId: string, chatKey: string): boolean {
  const lead = roomById(roomId)?.leadProfile;
  return configs.some((c) => c.profile === lead && c.leadChats.includes(chatKey));
}

function assignByVotes(configs: ReadonlyArray<TelegramRoomConfig>, votes: Votes): Map<string, string> {
  const candidates = [...votes.entries()].flatMap(([chatKey, scores]) => {
    const best = bestRoom(scores);
    return best ? [{ chatKey, ...best, lead: leads(configs, best.roomId, chatKey) }] : [];
  });
  const sorted = [...candidates].sort((a, b) => Number(b.lead) - Number(a.lead) || b.score - a.score);
  const byRoom = new Map<string, string>();
  for (const c of sorted) if (!byRoom.has(c.roomId)) byRoom.set(c.roomId, c.chatKey);
  return byRoom;
}

function assignByElimination(configs: ReadonlyArray<TelegramRoomConfig>, assigned: ReadonlyMap<string, string>): Map<string, string> {
  const taken = new Set(assigned.values());
  const extra = new Map<string, string>();
  for (const c of configs) {
    const openChats = c.leadChats.filter((k) => !taken.has(k));
    const openRooms = GROUP_ROOMS.filter((r) => r.leadProfile === c.profile && !assigned.has(r.id));
    const [chat] = openChats;
    const [room] = openRooms;
    if (openChats.length === 1 && openRooms.length === 1 && chat && room) extra.set(room.id, chat);
  }
  return extra;
}

export function deriveRoomChats(
  configs: ReadonlyArray<TelegramRoomConfig>,
  chatNames: Readonly<Record<string, string>>,
): RoomChat[] {
  const byVotes = assignByVotes(configs, collectVotes(configs, chatNames));
  const all = new Map([...byVotes, ...assignByElimination(configs, byVotes)]);
  return GROUP_ROOMS.flatMap((room): RoomChat[] => {
    const chatKey = all.get(room.id);
    if (!chatKey) return [];
    const profiles = configs.filter((c) => c.groupChats.includes(chatKey)).map((c) => c.profile);
    return [{ roomId: room.id, chatKey, profiles }];
  });
}

export function roomForChat(roomChats: ReadonlyArray<RoomChat>, chatKey: string): string | undefined {
  return roomChats.find((rc) => rc.chatKey === chatKey)?.roomId;
}

export function chatForRoom(roomChats: ReadonlyArray<RoomChat>, roomId: string): RoomChat | undefined {
  return roomChats.find((rc) => rc.roomId === roomId);
}
