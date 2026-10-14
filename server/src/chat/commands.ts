// Pure argv builders for the hermes CLI. Room chat goes to the room's lead bot; a direct line to that bot.
import { roomById } from '../rooms.ts';
import { OS_CREATOR_PREFIX } from '../domain/tasks.ts';

/** Seconds of wall clock the agent may use; below the server's 180 s timeout so it can wrap up. */
export const CHAT_RUN_BUDGET_S = 170;
export const CHAT_SESSION_PREFIX = 'dmos-';

export function chatTarget(roomId: string): { profile: string; prefix: string } | null {
  const room = roomById(roomId);
  if (!room) return null;
  return { profile: room.leadProfile, prefix: room.kind === 'dm' ? '' : `[${room.name} room] ` };
}

/** One named Hermes session per room (in the target profile), resumed with `-c <title> --create-if-missing`. */
export function chatSessionTitle(roomId: string): string {
  return `${CHAT_SESSION_PREFIX}${roomId}`;
}

export function buildChatArgs(profile: string, sessionTitle: string, query: string): string[] {
  return [
    '-p', profile, 'chat', '-Q', '-c', sessionTitle, '--create-if-missing', '--run-budget', String(CHAT_RUN_BUDGET_S),
    `--query=${query}`,
  ];
}

export function buildKanbanCreateArgs(title: string, assigneeProfile: string, roomId: string): string[] {
  return ['kanban', 'create', '--assignee', assigneeProfile, '--created-by', `${OS_CREATOR_PREFIX}${roomId}`, '--json', title];
}

/** What the office writes on a card it stops or hands over (fixed text: nothing from the browser reaches argv here). */
export const STOP_REASON = 'Stopped from Dunder Mifflin OS';
export const REASSIGN_REASON = 'Reassigned from Dunder Mifflin OS';

/** Run a cron job now, in the job's own profile. `hermes cron run` runs it to the end (minutes for an agent job). */
export function buildCronRunArgs(profile: string, jobId: string): string[] {
  return ['-p', profile, 'cron', 'run', jobId];
}

/** Stop a running card: reclaim ends its worker (SIGTERM) and releases the claim; block keeps it from being dispatched again. */
export function buildStopArgs(taskId: string): string[][] {
  return [
    ['kanban', 'reclaim', taskId, `--reason=${STOP_REASON}`],
    ['kanban', 'block', '--kind', 'needs_input', taskId, `${STOP_REASON}; unblock it to run it again`],
  ];
}

/** Hand a card to another profile; --reclaim stops its current run first when it is running (a no-op otherwise). */
export function buildReassignArgs(taskId: string, toProfile: string): string[] {
  return ['kanban', 'reassign', taskId, toProfile, '--reclaim', `--reason=${REASSIGN_REASON}`];
}
