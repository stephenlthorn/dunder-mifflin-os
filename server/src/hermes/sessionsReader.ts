// profiles/<p>/state.db -> latest session activity, Telegram group titles and room messages (final texts only).
import type { MessageQuery, RawMessage, SessionActivity } from './types.ts';
import type { ChatKeyer } from './chatKey.ts';
import { num, str } from './guards.ts';
import { withReadOnlyDb, type ReadDb, type Row } from './sqlite.ts';

const MESSAGE_TEXT_READ_MAX = 8000;

export function readLatestSession(file: string, profile: string): SessionActivity | null {
  const rows = withReadOnlyDb(file, (db) => db.all(
    `SELECT title, source, COALESCE(last_activity_at, started_at) AS t FROM sessions
     ORDER BY COALESCE(last_activity_at, started_at) DESC, started_at DESC LIMIT 1`));
  const r = rows?.[0];
  return r ? { profile, lastActivityAt: num(r.t), title: str(r.title, 200), source: str(r.source, 30) } : null;
}

export function readGroupChatNames(file: string, keyOf: ChatKeyer): Record<string, string> {
  const rows = withReadOnlyDb(file, (db) => db.all(
    `SELECT chat_id, display_name FROM sessions WHERE source = 'telegram' AND chat_type = 'group'
       AND chat_id IS NOT NULL AND display_name IS NOT NULL ORDER BY started_at ASC`)) ?? [];
  return Object.fromEntries(rows.flatMap((r) => {
    const name = str(r.display_name, 80);
    return name ? [[keyOf(r.chat_id), name]] : [];
  }));
}

function telegramSessionIds(db: ReadDb, target: MessageQuery['target'], keyOf: ChatKeyer): string[] {
  if (target.kind === 'none') return [];
  const rows = target.kind === 'dm'
    ? db.all(`SELECT id, chat_id FROM sessions WHERE source = 'telegram' AND chat_type = 'dm'`)
    : db.all(`SELECT id, chat_id FROM sessions WHERE source = 'telegram' AND chat_type = 'group' AND chat_id IS NOT NULL`)
      .filter((r) => keyOf(r.chat_id) === target.chatKey);
  return rows.map((r) => str(r.id, 80)).filter((id): id is string => id !== null);
}

function osSessionIds(db: ReadDb, title: string | null): string[] {
  if (!title) return [];
  return db.all(`SELECT id FROM sessions WHERE title = ? OR title LIKE ?`, title, `${title} #%`)
    .map((r) => str(r.id, 80)).filter((id): id is string => id !== null);
}

function toRaw(r: Row, profile: string, osIds: ReadonlySet<string>): RawMessage | null {
  const role = r.role === 'user' || r.role === 'assistant' ? r.role : null;
  const text = str(r.content, MESSAGE_TEXT_READ_MAX);
  const at = num(r.timestamp);
  const sessionId = str(r.session_id, 80);
  if (!role || !text || at === null || !sessionId) return null;
  const pid = r.platform_message_id;
  return {
    uid: str(r.message_uid, 64) ?? `m${String(r.id)}`, profile, role, text, at,
    origin: osIds.has(sessionId) ? 'os' : 'telegram',
    platformMessageId: typeof pid === 'string' || typeof pid === 'number' ? String(pid) : null,
  };
}

/** null = no state.db for this profile. */
export function readRoomMessages(file: string, profile: string, query: MessageQuery, keyOf: ChatKeyer): RawMessage[] | null {
  return withReadOnlyDb(file, (db) => {
    const osIds = osSessionIds(db, query.osSessionTitle);
    const ids = [...new Set([...telegramSessionIds(db, query.target, keyOf), ...osIds])];
    if (!ids.length) return [];
    const rows = db.all(
      `SELECT id, session_id, role, content, timestamp, platform_message_id, message_uid FROM messages
       WHERE session_id IN (${ids.map(() => '?').join(',')})
         AND role IN ('user', 'assistant') AND active = 1 AND display_kind IS NULL
         AND (role = 'user' OR tool_calls IS NULL OR tool_calls IN ('', '[]'))
         AND COALESCE(content, '') != ''
       ORDER BY timestamp DESC LIMIT ?`, ...ids, query.limit * 3);
    const osSet = new Set(osIds);
    return rows.map((r) => toRaw(r, profile, osSet)).filter((m): m is RawMessage => m !== null).reverse();
  });
}
