// GET /api/rooms/:id/messages. A group room reads its Telegram group in the lead's and members' state.db
// (plus the lead's Dunder Mifflin OS thread); a direct line reads the bot's Telegram DM + OS thread.
import type { AgentMessage } from '../adapters/types.ts';
import type { HermesSource, MessageQuery, RawMessage, RoomChat } from '../hermes/types.ts';
import { roomById } from '../rooms.ts';
import { isBotProfile } from '../roster.ts';
import { chatSessionTitle } from '../chat/commands.ts';
import { chatForRoom } from './roomChats.ts';
import { toAgentMessages } from './messages.ts';

export type RoomMessages = { messages: AgentMessage[]; reason?: string };

export const NOT_LINKED = 'room-not-linked-to-a-telegram-group';

function queriesFor(roomId: string, roomChats: ReadonlyArray<RoomChat>, limit: number): MessageQuery[] {
  const room = roomById(roomId);
  if (!room) return [];
  const osSessionTitle = chatSessionTitle(roomId);
  if (room.kind === 'dm') return [{ profile: room.leadProfile, target: { kind: 'dm' }, osSessionTitle, limit }];
  const chat = chatForRoom(roomChats, roomId);
  if (!chat) return [{ profile: room.leadProfile, target: { kind: 'none' }, osSessionTitle, limit }];
  const members = chat.profiles.filter((p) => p !== room.leadProfile && isBotProfile(p));
  const target = { kind: 'group', chatKey: chat.chatKey } as const;
  return [
    { profile: room.leadProfile, target, osSessionTitle, limit },
    ...members.map((profile) => ({ profile, target, osSessionTitle: null, limit })),
  ];
}

export async function collectRoomMessages(
  source: HermesSource, roomId: string, roomChats: ReadonlyArray<RoomChat>, limit: number,
): Promise<RoomMessages> {
  const queries = queriesFor(roomId, roomChats, limit);
  const results = await Promise.all(queries.map((q) => source.readMessages(q)));
  const raw: RawMessage[] = results.flatMap((r) => (r.ok ? [...r.messages] : []));
  const messages = toAgentMessages(raw, roomId, limit);
  if (messages.length) return { messages };
  const failure = results.find((r) => !r.ok);
  if (failure && !failure.ok && !results.some((r) => r.ok)) return { messages, reason: failure.reason };
  const linked = queries.some((q) => q.target.kind !== 'none');
  return { messages, reason: linked ? 'empty' : NOT_LINKED };
}
