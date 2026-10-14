// What you add to the demo day: your chat messages with the canned replies, and shared tasks you create. Kept in
// memory for the current day only (the next loop starts clean), bounded, and immutable: each change makes a new
// value. A new task is picked up 10 office minutes later and worked in the Ops room for 30 minutes.
import type { Task } from '../../../../shared/contract.ts';

export type MemoryChat = {
  readonly seq: number; readonly room: string; readonly from?: string; readonly text: string; readonly at: number; // office minute
};
export type MemoryTask = { readonly seq: number; readonly title: string; readonly owner: string; readonly room: string; readonly at: number };
export type Memory = { readonly day: number; readonly seq: number; readonly chats: ReadonlyArray<MemoryChat>; readonly tasks: ReadonlyArray<MemoryTask> };

export const CHATS_PER_ROOM = 40;
export const TASKS_PER_DAY = 20;
const PICKUP_MINUTES = 10;
const WORK_MINUTES = 30;

export const emptyMemory = (day: number): Memory => ({ day, seq: 0, chats: [], tasks: [] });

/** The memory for `day`: unchanged on the same day, empty once the day has looped. */
export const memoryFor = (memory: Memory, day: number): Memory => (memory.day === day ? memory : emptyMemory(day));

export function addChats(memory: Memory, chats: ReadonlyArray<Omit<MemoryChat, 'seq'>>): Memory {
  const added = chats.map((c, i) => ({ ...c, seq: memory.seq + i + 1 }));
  const all = [...memory.chats, ...added];
  const rooms = new Set(added.map((c) => c.room));
  const kept = all.filter((c) => !rooms.has(c.room) || all.filter((o) => o.room === c.room && o.seq > c.seq).length < CHATS_PER_ROOM);
  return { ...memory, seq: memory.seq + added.length, chats: kept };
}

export function addTask(memory: Memory, task: Omit<MemoryTask, 'seq'>): { memory: Memory; task: MemoryTask } | null {
  if (memory.tasks.length >= TASKS_PER_DAY) return null;
  const created = { ...task, seq: memory.seq + 1 };
  return { memory: { ...memory, seq: created.seq, tasks: [...memory.tasks, created] }, task: created };
}

export function taskStatusAt(task: MemoryTask, minute: number): { status: Task['status']; since: number } {
  if (minute >= task.at + PICKUP_MINUTES + WORK_MINUTES) return { status: 'done', since: task.at + PICKUP_MINUTES + WORK_MINUTES };
  if (minute >= task.at + PICKUP_MINUTES) return { status: 'doing', since: task.at + PICKUP_MINUTES };
  return { status: 'todo', since: task.at };
}

/** The next office minute after `minute` at which one of your tasks changes status. */
export function nextTaskChange(memory: Memory, minute: number): number | undefined {
  return memory.tasks.flatMap((t) => [t.at + PICKUP_MINUTES, t.at + PICKUP_MINUTES + WORK_MINUTES])
    .filter((m) => m > minute).sort((a, b) => a - b)[0];
}

/** How many messages you have sent to a room today (picks the next canned reply). */
export const sentTo = (memory: Memory, room: string): number => memory.chats.filter((c) => c.room === room && c.from === undefined).length;
