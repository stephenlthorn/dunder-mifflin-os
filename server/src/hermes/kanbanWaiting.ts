// ~/.hermes/kanban.db -> the cards that may be waiting on a human, READ-ONLY: `blocked`, `review` and `triage`, each with
// the reason from its latest blocked / block_loop_detected / review_requested event and its latest comment. Copes with
// older boards (no block_kind column, no events or comments tables). Which of these really wait on you, and what the
// buttons do, is decided in domain/hermesApprovals.ts.
import type { KanbanWaiting } from './types.ts';
import { isRecord, num, str } from './guards.ts';
import { withReadOnlyDb, type ReadDb, type Row } from './sqlite.ts';

const MAX_ROWS = 100;
const EVENTS = ['blocked', 'block_loop_detected', 'review_requested'] as const;
const STATUSES: ReadonlySet<string> = new Set(['blocked', 'review', 'triage']);

function hasTable(db: ReadDb, name: string): boolean {
  return db.all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, name).length > 0;
}

function hasColumn(db: ReadDb, table: string, column: string): boolean {
  return db.all(`SELECT name FROM pragma_table_info('${table}') WHERE name = ?`, column).length > 0;
}

function reasonOf(payload: unknown): string | null {
  if (typeof payload !== 'string') return null;
  try {
    const json: unknown = JSON.parse(payload);
    return isRecord(json) ? (str(json.reason, 2000) ?? str(json.summary, 2000)) : null;
  } catch {
    return null;
  }
}

function toWaiting(r: Row): KanbanWaiting | null {
  const id = str(r.id, 64);
  const status = str(r.status, 20);
  const createdAt = num(r.created_at);
  if (!id || !status || !STATUSES.has(status) || createdAt === null) return null;
  const event = (EVENTS as ReadonlyArray<unknown>).includes(r.event_kind) ? (r.event_kind as KanbanWaiting['event']) : null;
  return {
    id, title: str(r.title, 300) ?? '(untitled)', status: status as KanbanWaiting['status'],
    assignee: str(r.assignee, 60), createdBy: str(r.created_by, 60), blockKind: str(r.block_kind, 30),
    event, reason: reasonOf(r.event_payload), since: num(r.event_at) ?? createdAt, comment: str(r.last_comment, 2000),
  };
}

export function readKanbanWaiting(file: string): KanbanWaiting[] | null {
  return withReadOnlyDb(file, (db) => {
    const latest = (col: string) => hasTable(db, 'task_events')
      ? `(SELECT e.${col} FROM task_events e WHERE e.task_id = t.id AND e.kind IN (${EVENTS.map((k) => `'${k}'`).join(', ')}) ORDER BY e.id DESC LIMIT 1)`
      : 'NULL';
    const comment = hasTable(db, 'task_comments') ? '(SELECT c.body FROM task_comments c WHERE c.task_id = t.id ORDER BY c.id DESC LIMIT 1)' : 'NULL';
    const blockKind = hasColumn(db, 'tasks', 'block_kind') ? 't.block_kind' : 'NULL';
    const rows = db.all(
      `SELECT t.id, t.title, t.status, t.assignee, t.created_by, t.created_at, ${blockKind} AS block_kind,
              ${latest('kind')} AS event_kind, ${latest('payload')} AS event_payload, ${latest('created_at')} AS event_at,
              ${comment} AS last_comment
       FROM tasks t WHERE t.status IN ('blocked', 'review', 'triage') ORDER BY t.created_at DESC LIMIT ${MAX_ROWS}`);
    return rows.map(toWaiting).filter((w): w is KanbanWaiting => w !== null);
  });
}
