// profiles/<p>/state.db -> what the bot did in a window: conversation sessions, messages in and out (first
// ACTIVITY_TEXT_MAX characters only) and tool calls folded per session. Read-only (sqlite.ts).
import type { EpochSeconds } from './types.ts';
import { ACTIVITY_TEXT_MAX, type MessageRecord, type SessionRecord, type ToolBurst } from './activityTypes.ts';
import { num, str } from './guards.ts';
import type { ReadDb, Row } from './sqlite.ts';

/** Sessions whose own runs already tell the story (cron jobs, kanban cards). */
const RUN_SOURCES = `('cron', 'kanban')`;
/** Sessions that were alive in the window; keeps the message queries on the (session_id, timestamp) index. */
const ACTIVE_SESSIONS = `SELECT id FROM sessions WHERE COALESCE(ended_at, last_activity_at, started_at) >= ?`;

function toSession(r: Row): SessionRecord | null {
  const id = str(r.id, 120);
  const startedAt = num(r.started_at);
  if (!id || startedAt === null) return null;
  return {
    id, startedAt, source: str(r.source, 30), endedAt: num(r.ended_at), endReason: str(r.end_reason, 40),
    title: str(r.title, 200), messageCount: num(r.message_count),
  };
}

export function readSessions(db: ReadDb, since: EpochSeconds, limit: number): SessionRecord[] {
  return db.all(
    `SELECT id, source, started_at, ended_at, end_reason, title, message_count FROM sessions
     WHERE (started_at >= ? OR ended_at >= ?) AND source NOT IN ${RUN_SOURCES}
     ORDER BY COALESCE(ended_at, started_at) DESC LIMIT ?`, since, since, limit,
  ).map(toSession).filter((s): s is SessionRecord => s !== null);
}

function toMessage(r: Row): MessageRecord | null {
  const role = r.role === 'user' || r.role === 'assistant' ? r.role : null;
  const text = str(r.text, ACTIVITY_TEXT_MAX);
  const at = num(r.timestamp);
  if (!role || !text || at === null) return null;
  return { id: `m${String(r.id)}`, source: str(r.source, 30), role, text, at };
}

export function readMessages(db: ReadDb, since: EpochSeconds, limit: number): MessageRecord[] {
  return db.all(
    `SELECT m.id, s.source, m.role, substr(m.content, 1, ${ACTIVITY_TEXT_MAX}) AS text, m.timestamp FROM messages m
     JOIN sessions s ON s.id = m.session_id
     WHERE m.session_id IN (${ACTIVE_SESSIONS}) AND m.timestamp >= ?
       AND m.role IN ('user', 'assistant') AND m.display_kind IS NULL AND COALESCE(m._compressed_summary, 0) = 0
       AND (m.role = 'user' OR m.tool_calls IS NULL OR m.tool_calls IN ('', '[]'))
       AND NOT (m.role = 'user' AND s.source IN ${RUN_SOURCES})
       AND COALESCE(m.content, '') != ''
     ORDER BY m.timestamp DESC LIMIT ?`, since, since, limit,
  ).map(toMessage).filter((m): m is MessageRecord => m !== null);
}

export function readToolBursts(db: ReadDb, since: EpochSeconds, limit: number): ToolBurst[] {
  const rows = db.all(
    `SELECT m.session_id, s.source, COALESCE(m.tool_name, 'tool') AS tool, COUNT(*) AS n, MAX(m.timestamp) AS last FROM messages m
     JOIN sessions s ON s.id = m.session_id
     WHERE m.session_id IN (${ACTIVE_SESSIONS}) AND m.timestamp >= ? AND m.role = 'tool'
     GROUP BY m.session_id, m.tool_name`, since, since,
  );
  const bySession = rows.reduce((acc, r) => {
    const sessionId = str(r.session_id, 120);
    const name = str(r.tool, 80);
    const n = num(r.n);
    const last = num(r.last);
    if (!sessionId || !name || n === null || last === null) return acc;
    const prev = acc.get(sessionId);
    const burst: ToolBurst = prev
      ? { ...prev, count: prev.count + n, tools: [...prev.tools, { name, count: n }], lastAt: Math.max(prev.lastAt, last) }
      : { sessionId, source: str(r.source, 30), count: n, tools: [{ name, count: n }], lastAt: last };
    return new Map([...acc, [sessionId, burst]]);
  }, new Map<string, ToolBurst>());
  return [...bySession.values()]
    .map((b) => ({ ...b, tools: [...b.tools].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)) }))
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, limit);
}
