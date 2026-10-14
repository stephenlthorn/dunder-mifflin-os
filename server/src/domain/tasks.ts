// Kanban cards -> contract Tasks. A card's room comes from (in order): the Dunder Mifflin OS created_by marker,
// its notify subscription (group chat -> room, DM -> that bot's direct line), or council origin.
// A card is SHARED when its room is ops/council or it is linked to a card of another assignee.
import type { Task } from '../../../shared/contract.ts';
import type { AgentTask } from '../adapters/types.ts';
import type { EpochSeconds, KanbanRun, KanbanState, KanbanTask, RoomChat } from '../hermes/types.ts';
import { SHARED_ROOM_IDS, dmRoomId, roomById } from '../rooms.ts';
import { isBotProfile } from '../roster.ts';
import { roomForChat } from './roomChats.ts';
import { toIso, type RunView } from './presence.ts';
import { scrubText } from './scrub.ts';

/** created_by value for cards created from a Dunder Mifflin OS room: `dmos-<roomId>`. */
export const OS_CREATOR_PREFIX = 'dmos-';
const DONE_WINDOW_S = 48 * 3600;
const MAX_TASKS = 200;

export type TaskInfo = { readonly task: KanbanTask; readonly roomId?: string; readonly shared: boolean };

const STATUS: Readonly<Record<string, Task['status']>> = {
  triage: 'todo', todo: 'todo', ready: 'todo', scheduled: 'todo',
  running: 'doing', review: 'doing', blocked: 'blocked', done: 'done',
};

export function mapKanbanStatus(status: string): Task['status'] | null {
  return Object.hasOwn(STATUS, status) ? (STATUS[status] ?? null) : null;
}

function osRoom(createdBy: string | null): string | undefined {
  if (!createdBy?.startsWith(OS_CREATOR_PREFIX)) return undefined;
  const roomId = createdBy.slice(OS_CREATOR_PREFIX.length);
  return roomById(roomId) ? roomId : undefined;
}

function subRooms(kanban: KanbanState, roomChats: ReadonlyArray<RoomChat>): ReadonlyMap<string, ReadonlyArray<string>> {
  const rooms = new Map<string, string[]>();
  for (const sub of kanban.subs) {
    const roomId = sub.chatType === 'dm'
      ? (isBotProfile(sub.notifierProfile) ? dmRoomId(sub.notifierProfile) : undefined)
      : roomForChat(roomChats, sub.chatKey);
    if (roomId) rooms.set(sub.taskId, [...(rooms.get(sub.taskId) ?? []), roomId]);
  }
  return rooms;
}

function crossAssigneeLinked(kanban: KanbanState): ReadonlySet<string> {
  return new Set(kanban.links.flatMap(({ parentId, childId, parentAssignee: a, childAssignee: b }) =>
    (a && b && a !== b ? [parentId, childId] : [])));
}

export function annotateTasks(kanban: KanbanState, roomChats: ReadonlyArray<RoomChat>): TaskInfo[] {
  const bySub = subRooms(kanban, roomChats);
  const linked = crossAssigneeLinked(kanban);
  return kanban.tasks.map((task): TaskInfo => {
    const subs = bySub.get(task.id) ?? [];
    const fromSubs = subs.find((r) => SHARED_ROOM_IDS.has(r)) ?? subs[0];
    const room = osRoom(task.createdBy) ?? fromSubs ?? (task.createdBy === 'council' ? 'council' : undefined);
    const shared = (room !== undefined && SHARED_ROOM_IDS.has(room)) || linked.has(task.id);
    const roomId = room ?? (shared ? 'ops' : undefined);
    return roomId ? { task, roomId, shared } : { task, shared };
  });
}

function updatedAt(t: KanbanTask): EpochSeconds {
  return Math.max(t.createdAt, t.startedAt ?? 0, t.completedAt ?? 0, t.lastHeartbeatAt ?? 0);
}

/** Kanban cards -> adapter tasks; the owner stays a profile key (the office maps it to a person). */
export function toAgentTasks(infos: ReadonlyArray<TaskInfo>, now: EpochSeconds): AgentTask[] {
  return infos
    .flatMap((info): Array<{ at: EpochSeconds; task: AgentTask }> => {
      const status = mapKanbanStatus(info.task.status);
      if (!status) return [];
      const at = updatedAt(info.task);
      if (status === 'done' && at < now - DONE_WINDOW_S) return [];
      const owner = isBotProfile(info.task.assignee) ? info.task.assignee : undefined;
      return [{
        at,
        task: {
          id: info.task.id, title: scrubText(info.task.title), status,
          ...(owner ? { ownerAgentId: owner } : {}),
          ...(info.roomId ? { roomId: info.roomId } : {}),
          shared: info.shared, updatedAt: toIso(at),
        },
      }];
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_TASKS)
    .map((x) => x.task);
}

/** One bot's kanban runs (running + recently ended) with the card's title, room and shared flag. */
export function runsForProfile(infos: ReadonlyArray<TaskInfo>, runs: ReadonlyArray<KanbanRun>, profile: string): RunView[] {
  const byId = new Map(infos.map((i) => [i.task.id, i]));
  return runs
    .filter((r) => r.profile === profile)
    .map((r): RunView => {
      const info = byId.get(r.taskId);
      const base = {
        title: info?.task.title ?? 'Kanban card', status: r.status, outcome: r.outcome, startedAt: r.startedAt,
        endedAt: r.endedAt, lastHeartbeatAt: r.lastHeartbeatAt, shared: info?.shared ?? false,
      };
      return info?.roomId ? { ...base, roomId: info.roomId } : base;
    });
}
