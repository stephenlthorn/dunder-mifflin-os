// ~/.hermes/kanban.db -> one bot's cards and runs in a window. Titles only: never bodies, results, summaries or errors.
import type { EpochSeconds } from './types.ts';
import type { RunRecord, TaskRecord } from './activityTypes.ts';
import { num, str } from './guards.ts';
import type { ReadDb, Row } from './sqlite.ts';

function toTask(r: Row): TaskRecord | null {
  const id = str(r.id, 64);
  const createdAt = num(r.created_at);
  return id && createdAt !== null ? { id, title: str(r.title, 300) ?? '(untitled)', createdAt } : null;
}

function toRun(r: Row): RunRecord | null {
  const taskId = str(r.task_id, 64);
  const status = str(r.status, 20);
  const startedAt = num(r.started_at);
  if (!taskId || !status || startedAt === null) return null;
  return {
    id: `r${String(r.id)}`, taskId, title: str(r.title, 300) ?? '(untitled)', status, outcome: str(r.outcome, 30),
    startedAt, endedAt: num(r.ended_at),
  };
}

export function readAssignedTasks(db: ReadDb, profile: string, since: EpochSeconds, limit: number): TaskRecord[] {
  return db.all(
    `SELECT id, title, created_at FROM tasks WHERE assignee = ? AND created_at >= ? AND status != 'archived'
     ORDER BY created_at DESC LIMIT ?`, profile, since, limit,
  ).map(toTask).filter((t): t is TaskRecord => t !== null);
}

export function readRuns(db: ReadDb, profile: string, since: EpochSeconds, limit: number): RunRecord[] {
  return db.all(
    `SELECT r.id, r.task_id, t.title, r.status, r.outcome, r.started_at, r.ended_at FROM task_runs r
     LEFT JOIN tasks t ON t.id = r.task_id
     WHERE r.profile = ? AND (r.started_at >= ? OR r.ended_at >= ?)
     ORDER BY r.started_at DESC LIMIT ?`, profile, since, since, limit,
  ).map(toRun).filter((r): r is RunRecord => r !== null);
}
