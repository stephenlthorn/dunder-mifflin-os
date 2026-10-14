// Reads the real ~/.hermes once through the live adapter and prints a REDACTED summary (counts and ids only;
// no chat ids, titles or message text). Usage: npm run live-summary
import { createLiveSource } from '../src/hermes/liveSource.ts';
import { buildSnapshot, roomChatsOf } from '../src/domain/snapshot.ts';
import { collectRoomMessages } from '../src/domain/roomMessages.ts';
import { loadPeople } from '../src/people.ts';
import { HERMES_HOME, HERMES_STATUS_URL } from '../src/config.ts';

function countBy<T>(items: ReadonlyArray<T>, key: (t: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, t) => ({ ...acc, [key(t)]: (acc[key(t)] ?? 0) + 1 }), {});
}

const source = createLiveSource({ hermesHome: HERMES_HOME, statusUrl: HERMES_STATUS_URL });
const started = performance.now();
const state = await source.readState();
const readMs = Math.round(performance.now() - started);
const snap = buildSnapshot(state, loadPeople(), Date.now() / 1000);
const roomChats = roomChatsOf(state);

console.log('read ms:', readMs);
console.log('gateway running:', state.gateway?.running ?? 'unreadable', '| telegram platforms:', state.gateway?.platforms.length ?? 0,
  countBy(state.gateway?.platforms ?? [], (p) => `${p.state}${p.errorCode ? '+error' : ''}`));
console.log('rooms linked to a Telegram group:', roomChats.map((rc) => `${rc.roomId}(${rc.profiles.length} bots)`).join(' '));
console.log('kanban rows: tasks', state.kanban.tasks.length, '| runs', state.kanban.runs.length, countBy(state.kanban.runs, (r) => r.status),
  '| subs', state.kanban.subs.length, '| links', state.kanban.links.length);
console.log('snapshot tasks:', snap.tasks.length, countBy(snap.tasks, (t) => t.status), '| shared', snap.tasks.filter((t) => t.shared).length,
  '| by room', countBy(snap.tasks.filter((t) => t.roomId), (t) => t.roomId ?? ''));
console.log('sessions:', state.sessions.length, '| cron jobs:', state.cron.length, '| personas:', Object.keys(state.personas).length);
console.log('presence by status:', countBy(Object.values(snap.presence), (p) => p.status));
console.log('presence per bot:', snap.people.filter((p) => p.bot).map((p) => `${p.id}=${snap.presence[p.id]?.status}${snap.presence[p.id]?.roomId ? `@${snap.presence[p.id]?.roomId}` : ''}`).join(' '));
console.log('names from personas:', snap.people.filter((p) => p.bot).map((p) => p.name).join(', '));
for (const room of snap.rooms.filter((r) => r.kind !== 'dm')) {
  const res = await collectRoomMessages(source, room.id, roomChats, 50);
  console.log(`messages ${room.id}:`, res.messages.length, res.reason ? `(reason: ${res.reason})` : '',
    countBy(res.messages, (m) => (m.authorAgentId === undefined ? 'you' : 'bot')));
}
const json = JSON.stringify(snap);
console.log('snapshot bytes:', json.length, '| contains digits-only ids >= 9 chars:', /\b-?\d{9,}\b/.test(json));
