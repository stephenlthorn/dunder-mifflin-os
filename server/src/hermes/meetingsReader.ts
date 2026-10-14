// ~/.hermes/kanban.db -> MeetingRecords for Conference Room minutes, READ-ONLY (sqlite.ts opens it readOnly +
// query_only). Candidates: cards created by the council or from the OS, or with a room subscription or a link, whose
// activity overlaps the period. Never selects card bodies, results, run metadata/errors or event payloads beyond a
// block reason. task_comments and task_events are optional (older Hermes): missing tables read as empty.
import type { ChatKeyer } from './chatKey.ts';
import type { EpochSeconds, KanbanLink, KanbanSub, KanbanTask } from './types.ts';
import { MINUTES_EVENT_KINDS, type KanbanComment, type KanbanEvent, type MeetingRecords, type MeetingRun } from './meetingTypes.ts';
import { isRecord, num, str } from './guards.ts';
import { withReadOnlyDb, type ReadDb, type Row } from './sqlite.ts';

const MAX_CARDS = 400;
const MAX_ROWS = 3000;
const TEXT_MAX = 1200; // free text is cut in SQL already; the domain scrubs and clips it further

const CANDIDATES = `WITH cand AS (
  SELECT t.id FROM tasks t
  WHERE t.created_at < ?
    AND MAX(t.created_at, COALESCE(t.started_at, 0), COALESCE(t.completed_at, 0), COALESCE(t.last_heartbeat_at, 0)) >= ?
    AND (t.created_by = 'council' OR t.created_by LIKE 'dmos-%'
      OR EXISTS (SELECT 1 FROM kanban_notify_subs s WHERE s.task_id = t.id)
      OR EXISTS (SELECT 1 FROM task_links l WHERE l.parent_id = t.id OR l.child_id = t.id))
  ORDER BY t.created_at DESC LIMIT ${MAX_CARDS})`;

type Period = { readonly from: EpochSeconds; readonly to: EpochSeconds };

function keep<T>(rows: Row[], map: (r: Row) => T | null): T[] {
  return rows.map(map).filter((x): x is T => x !== null);
}

/** A query on a table older Hermes versions don't have: a missing table reads as no rows. */
function optional(db: ReadDb, sql: string, ...params: Array<string | number>): Row[] {
  try {
    return db.all(sql, ...params);
  } catch (error) {
    if (error instanceof Error && /no such table/i.test(error.message)) return [];
    throw error;
  }
}

function toTask(r: Row): KanbanTask | null {
  const id = str(r.id, 64);
  const status = str(r.status, 20);
  const createdAt = num(r.created_at);
  if (!id || !status || createdAt === null) return null;
  return {
    id, status, createdAt, title: str(r.title, 300) ?? '(untitled)', assignee: str(r.assignee, 60), createdBy: str(r.created_by, 60),
    tenant: null, startedAt: num(r.started_at), completedAt: num(r.completed_at), lastHeartbeatAt: num(r.last_heartbeat_at),
  };
}

function toRun(r: Row): MeetingRun | null {
  const taskId = str(r.task_id, 64);
  const status = str(r.status, 20);
  const startedAt = num(r.started_at);
  if (!taskId || !status || startedAt === null) return null;
  return {
    taskId, status, startedAt, profile: str(r.profile, 60), outcome: str(r.outcome, 30), endedAt: num(r.ended_at),
    lastHeartbeatAt: num(r.last_heartbeat_at), summary: str(r.summary, TEXT_MAX),
  };
}

function toComment(r: Row): KanbanComment | null {
  const taskId = str(r.task_id, 64);
  const author = str(r.author, 60);
  const body = str(r.body, TEXT_MAX);
  const createdAt = num(r.created_at);
  return taskId && author && body !== null && createdAt !== null ? { taskId, author, body, createdAt } : null;
}

function blockReason(payload: unknown): string | null {
  if (typeof payload !== 'string') return null;
  try {
    const json: unknown = JSON.parse(payload);
    return isRecord(json) ? str(json.reason, 600) : null;
  } catch {
    return null;
  }
}

function toEvent(r: Row): KanbanEvent | null {
  const taskId = str(r.task_id, 64);
  const kind = str(r.kind, 30);
  const createdAt = num(r.created_at);
  if (!taskId || !kind || createdAt === null) return null;
  return { taskId, kind, createdAt, profile: str(r.profile, 60), reason: kind === 'blocked' ? blockReason(r.payload) : null };
}

export function readMeetingRecords(file: string, keyOf: ChatKeyer, period: Period): MeetingRecords | null {
  const p = [period.to, period.from] as const;
  const kinds = MINUTES_EVENT_KINDS.map(() => '?').join(',');
  return withReadOnlyDb(file, (db) => ({
    tasks: keep(db.all(`${CANDIDATES} SELECT t.id, t.title, t.assignee, t.status, t.created_by, t.created_at, t.started_at, t.completed_at,
      t.last_heartbeat_at FROM tasks t WHERE t.id IN (SELECT id FROM cand) ORDER BY t.created_at`, ...p), toTask),
    runs: keep(db.all(`${CANDIDATES} SELECT task_id, profile, status, outcome, started_at, ended_at, last_heartbeat_at,
      substr(summary, 1, ${TEXT_MAX}) AS summary FROM task_runs WHERE task_id IN (SELECT id FROM cand)
      ORDER BY started_at, id LIMIT ${MAX_ROWS}`, ...p), toRun),
    subs: keep(db.all(`${CANDIDATES} SELECT task_id, chat_id, chat_type, notifier_profile FROM kanban_notify_subs
      WHERE task_id IN (SELECT id FROM cand)`, ...p), (r): KanbanSub | null => {
      const taskId = str(r.task_id, 64);
      return taskId && r.chat_id != null ? { taskId, chatKey: keyOf(r.chat_id), chatType: str(r.chat_type, 20), notifierProfile: str(r.notifier_profile, 60) } : null;
    }),
    links: keep(db.all(`${CANDIDATES} SELECT l.parent_id, l.child_id, pt.assignee AS parent_assignee, ct.assignee AS child_assignee
      FROM task_links l JOIN tasks pt ON pt.id = l.parent_id JOIN tasks ct ON ct.id = l.child_id
      WHERE l.parent_id IN (SELECT id FROM cand) OR l.child_id IN (SELECT id FROM cand)`, ...p), (r): KanbanLink | null => {
      const parentId = str(r.parent_id, 64);
      const childId = str(r.child_id, 64);
      return parentId && childId ? { parentId, childId, parentAssignee: str(r.parent_assignee, 60), childAssignee: str(r.child_assignee, 60) } : null;
    }),
    comments: keep(optional(db, `${CANDIDATES} SELECT task_id, author, substr(body, 1, ${TEXT_MAX}) AS body, created_at FROM task_comments
      WHERE task_id IN (SELECT id FROM cand) ORDER BY created_at, id LIMIT ${MAX_ROWS}`, ...p), toComment),
    events: keep(optional(db, `${CANDIDATES} SELECT e.task_id, e.kind, e.created_at, r.profile,
      CASE WHEN e.kind = 'blocked' THEN substr(e.payload, 1, 2000) END AS payload
      FROM task_events e LEFT JOIN task_runs r ON r.id = e.run_id
      WHERE e.task_id IN (SELECT id FROM cand) AND e.kind IN (${kinds}) ORDER BY e.created_at, e.id LIMIT ${MAX_ROWS}`, ...p, ...MINUTES_EVENT_KINDS), toEvent),
  }));
}
