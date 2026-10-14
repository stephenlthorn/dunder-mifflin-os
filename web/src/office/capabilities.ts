// What the UI may offer for a room or a bot, from the capability flags its adapter declared (shared/contract.ts).
// Data from a server that predates adapters carries no flags: that server only ran Hermes, which can chat and take tasks.
import type { AgentCapabilities, Person, Room } from '@shared/contract';

const LEGACY_ADAPTER = 'hermes';
const LEGACY: AgentCapabilities = { chat: true, createTask: true, approvals: false, pause: false, stop: false };

const capsOf = (caps: AgentCapabilities | undefined): AgentCapabilities => caps ?? LEGACY;

export const canChat = (room: Room): boolean => capsOf(room.capabilities).chat;

export const canCreateTask = (room: Room): boolean => capsOf(room.capabilities).createTask;

/** Bots that can be given a task from this room: same adapter as the room, and able to take tasks. */
export function taskAssignees(room: Room, people: readonly Person[]): Person[] {
  const adapter = room.adapter ?? LEGACY_ADAPTER;
  return people.filter((p) => p.bot && (p.bot.adapter ?? LEGACY_ADAPTER) === adapter && capsOf(p.bot.capabilities).createTask);
}
