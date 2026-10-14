// ~/.hermes/kanban.db -> KanbanState: open + recently finished cards, running + recently ended runs,
// notify subscriptions (chat ids -> opaque keys) and links (with both assignees).
import type { EpochSeconds, KanbanLink, KanbanRun, KanbanState, KanbanSub, KanbanTask } from './types.ts';
import type { ChatKeyer } from './chatKey.ts';
import { num, str } from './guards.ts';
import { withReadOnlyDb, type Row } from './sqlite.ts';

export const DONE_LOOKBACK_S = 48 * 3600;
export const RUN_LOOKBACK_S = 60 * 60;
const MAX_ROWS = 1000;

/** SQL: card is shown (not archived; done only when finished after the cutoff `?`). */
function visible(alias: string): string {
  return `(${alias}.status != 'archived' AND (${alias}.status != 'done' OR COALESCE(${alias}.completed_at, ${alias}.created_at) >= ?))`;
}

function toTask(r: Row): KanbanTask | null {
  const id = str(r.id, 64);
  const status = str(r.status, 20);
  const createdAt = num(r.created_at);
  if (!id || !status || createdAt === null) return null;
  return {
    id, status, createdAt,
    title: str(r.title, 300) ?? '(untitled)',
    assignee: str(r.assignee, 60), createdBy: str(r.created_by, 60), tenant: str(r.tenant, 60),
    startedAt: num(r.started_at), completedAt: num(r.completed_at), lastHeartbeatAt: num(r.last_heartbeat_at),
  };
}

function toRun(r: Row): KanbanRun | null {
  const taskId = str(r.task_id, 64);
  const status = str(r.status, 20);
  const startedAt = num(r.started_at);
  if (!taskId || !status || startedAt === null) return null;
  return {
    taskId, status, startedAt, profile: str(r.profile, 60), outcome: str(r.outcome, 30),
    endedAt: num(r.ended_at), lastHeartbeatAt: num(r.last_heartbeat_at),
  };
}

function toSub(r: Row, keyOf: ChatKeyer): KanbanSub | null {
  const taskId = str(r.task_id, 64);
  if (!taskId || r.chat_id === null || r.chat_id === undefined) return null;
  return { taskId, chatKey: keyOf(r.chat_id), chatType: str(r.chat_type, 20), notifierProfile: str(r.notifier_profile, 60) };
}

function toLink(r: Row): KanbanLink | null {
  const parentId = str(r.parent_id, 64);
  const childId = str(r.child_id, 64);
  if (!parentId || !childId) return null;
  return { parentId, childId, parentAssignee: str(r.parent_assignee, 60), childAssignee: str(r.child_assignee, 60) };
}

function keep<T>(rows: Row[], map: (r: Row) => T | null): T[] {
  return rows.map(map).filter((x): x is T => x !== null);
}

export function readKanban(file: string, keyOf: ChatKeyer, now: EpochSeconds): KanbanState | null {
  const cutoff = now - DONE_LOOKBACK_S;
  return withReadOnlyDb(file, (db) => ({
    tasks: keep(db.all(
      `SELECT t.id, t.title, t.assignee, t.status, t.created_by, t.tenant, t.created_at, t.started_at, t.completed_at,
              t.last_heartbeat_at
       FROM tasks t WHERE ${visible('t')} ORDER BY t.created_at DESC LIMIT ${MAX_ROWS}`, cutoff), toTask),
    runs: keep(db.all(
      `SELECT task_id, profile, status, outcome, started_at, ended_at, last_heartbeat_at FROM task_runs
       WHERE status = 'running' OR ended_at >= ? ORDER BY started_at DESC LIMIT ${MAX_ROWS}`, now - RUN_LOOKBACK_S), toRun),
    subs: keep(db.all(
      `SELECT s.task_id, s.chat_id, s.chat_type, s.notifier_profile FROM kanban_notify_subs s
       JOIN tasks t ON t.id = s.task_id WHERE ${visible('t')}`, cutoff), (r) => toSub(r, keyOf)),
    links: keep(db.all(
      `SELECT l.parent_id, l.child_id, p.assignee AS parent_assignee, c.assignee AS child_assignee FROM task_links l
       JOIN tasks p ON p.id = l.parent_id JOIN tasks c ON c.id = l.child_id
       WHERE ${visible('p')} OR ${visible('c')}`, cutoff, cutoff), toLink),
  }));
}
