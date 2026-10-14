// Raw Hermes messages (Telegram room sessions + the OS chat thread) -> adapter messages (author = profile key;
// no author = the human user). The office maps authors to people.
import type { AgentMessage } from '../adapters/types.ts';
import type { RawMessage } from '../hermes/types.ts';
import { toIso } from './presence.ts';
import { scrubText } from './scrub.ts';

export const MESSAGE_TEXT_MAX = 4000;
const SENDER_TAG = /^\[[^\]:\n]{1,40}\]\s+/; // "[Jan Levinson] " / "[Ops room] "; not "[Replying to: …]"
const SILENT = new Set(['NO_REPLY', '[SILENT]', 'HEARTBEAT_OK']);

function clean(m: RawMessage): string {
  const text = m.text.trim();
  const stripped = scrubText(m.role === 'user' ? text.replace(SENDER_TAG, '') : text);
  return stripped.length > MESSAGE_TEXT_MAX ? `${stripped.slice(0, MESSAGE_TEXT_MAX - 1)}…` : stripped;
}

function dedupeKey(m: RawMessage, text: string): string {
  if (m.role !== 'user') return `${m.profile}:${m.uid}`;
  // Telegram message ids are unique per chat; a room merge only ever spans one chat, plus the OS thread.
  return m.platformMessageId ? `p:${m.origin}:${m.platformMessageId}` : `t:${m.origin}:${text}:${Math.floor(m.at / 5)}`;
}

export function toAgentMessages(raw: ReadonlyArray<RawMessage>, roomId: string, limit: number): AgentMessage[] {
  const seen = new Set<string>();
  const sorted = [...raw].sort((a, b) => a.at - b.at);
  const out: AgentMessage[] = [];
  for (const m of sorted) {
    const text = clean(m);
    if (!text || SILENT.has(text)) continue;
    const key = dedupeKey(m, text);
    if (seen.has(key)) continue;
    seen.add(key);
    const base = { id: `${m.profile}-${m.uid}`, roomId, text, at: toIso(m.at) };
    out.push(m.role === 'user' ? base : { ...base, authorAgentId: m.profile });
  }
  return out.slice(-limit);
}
