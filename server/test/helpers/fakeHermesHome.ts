// Builds a throwaway HERMES_HOME (temp dir) with the subset of files/tables the live adapter reads.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const T0 = 1_800_000_000; // epoch seconds used by the fake data

const KANBAN_SCHEMA = `
CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT, assignee TEXT, status TEXT NOT NULL, created_by TEXT,
  created_at INTEGER NOT NULL, started_at INTEGER, completed_at INTEGER, tenant TEXT, last_heartbeat_at INTEGER);
CREATE TABLE task_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, profile TEXT, status TEXT NOT NULL,
  started_at INTEGER NOT NULL, ended_at INTEGER, outcome TEXT, last_heartbeat_at INTEGER, summary TEXT, error TEXT);
CREATE TABLE task_links (parent_id TEXT NOT NULL, child_id TEXT NOT NULL, PRIMARY KEY (parent_id, child_id));
CREATE TABLE kanban_notify_subs (task_id TEXT NOT NULL, platform TEXT NOT NULL, chat_id TEXT NOT NULL, thread_id TEXT NOT NULL DEFAULT '',
  user_id TEXT, chat_type TEXT, notifier_profile TEXT, delivery_mode TEXT NOT NULL DEFAULT 'notify', created_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, platform, chat_id, thread_id));`;

const STATE_SCHEMA = `
CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT NOT NULL, user_id TEXT, chat_id TEXT, chat_type TEXT, display_name TEXT,
  started_at REAL NOT NULL, title TEXT, last_activity_at REAL);
CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT, tool_calls TEXT,
  timestamp REAL NOT NULL, platform_message_id TEXT, active INTEGER NOT NULL DEFAULT 1, display_kind TEXT, message_uid TEXT);`;

export const OPS_CHAT = '-1009990001';
export const COUNCIL_CHAT = '-1009990002';
export const DM_CHAT = '5550001';

function kanbanDb(file: string): void {
  const db = new DatabaseSync(file);
  db.exec(KANBAN_SCHEMA);
  const task = db.prepare('INSERT INTO tasks (id,title,assignee,status,created_by,created_at,started_at,completed_at,tenant,last_heartbeat_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
  task.run('t_run', 'Shared ops card', 'campaigns', 'running', 'worker', T0 - 600, T0 - 120, null, null, T0 - 30);
  task.run('t_done_old', 'Ancient card', 'tech', 'done', 'user', T0 - 900_000, T0 - 899_000, T0 - 890_000, null, null);
  task.run('t_arch', 'Archived card', 'tech', 'archived', 'user', T0 - 100, null, null, null, null);
  task.run('t_crash', 'Crashy card', 'social', 'ready', 'user', T0 - 5000, T0 - 4000, null, null, null);
  task.run('t_parent', 'Parent', 'tech', 'done', 'user', T0 - 900_000, null, T0 - 899_000, null, null);
  const run = db.prepare('INSERT INTO task_runs (task_id,profile,status,started_at,ended_at,outcome,last_heartbeat_at,error) VALUES (?,?,?,?,?,?,?,?)');
  run.run('t_run', 'campaigns', 'running', T0 - 120, null, null, T0 - 30, null);
  run.run('t_crash', 'social', 'crashed', T0 - 4000, T0 - 600, 'crashed', null, 'Traceback secret=xyz');
  run.run('t_done_old', 'tech', 'done', T0 - 899_000, T0 - 890_000, 'completed', null, null);
  db.prepare('INSERT INTO task_links (parent_id, child_id) VALUES (?,?)').run('t_parent', 't_run');
  db.prepare('INSERT INTO kanban_notify_subs (task_id,platform,chat_id,chat_type,notifier_profile,created_at) VALUES (?,?,?,?,?,?)')
    .run('t_run', 'telegram', OPS_CHAT, 'group', 'tech', T0 - 600);
  db.close();
}

function stateDb(file: string, rows: { sessions: unknown[][]; messages: unknown[][] }): void {
  const db = new DatabaseSync(file);
  db.exec(STATE_SCHEMA);
  db.exec('PRAGMA journal_mode=WAL');
  const s = db.prepare('INSERT INTO sessions (id,source,user_id,chat_id,chat_type,display_name,started_at,title,last_activity_at) VALUES (?,?,?,?,?,?,?,?,?)');
  for (const r of rows.sessions) s.run(...(r as Array<string | number | null>));
  const m = db.prepare('INSERT INTO messages (session_id,role,content,tool_calls,timestamp,platform_message_id,active,display_kind,message_uid) VALUES (?,?,?,?,?,?,?,?,?)');
  for (const r of rows.messages) m.run(...(r as Array<string | number | null>));
  db.close();
}

const TECH_CONFIG = `
model:
  default: some-model
basic_auth:
  password: hunter2
platforms:
  telegram:
    enabled: true
    group_allowed_chats: [${OPS_CHAT}, ${COUNCIL_CHAT}]
    free_response_chats: [${OPS_CHAT}]
    channel_prompts:
      '${OPS_CHAT}': |-
        Team group rules. Rooms and their leads: Ops = tech; Council = chief.

        You lead the Ops room.
      '${COUNCIL_CHAT}': |-
        Team group rules.

        You are the CTO on the council in the Council room.
    home_channel:
      chat_id: '${DM_CHAT}'
      name: Jan Levinson
`;

export function makeFakeHermesHome(): string {
  const home = mkdtempSync(path.join(tmpdir(), 'dmos-hermes-'));
  for (const p of ['tech', 'campaigns', 'social']) mkdirSync(path.join(home, 'profiles', p, 'cron'), { recursive: true });
  mkdirSync(path.join(home, 'personas'), { recursive: true });
  writeFileSync(path.join(home, 'gateway_state.json'), JSON.stringify({
    pid: process.pid, gateway_state: 'running',
    platforms: {
      'tech:telegram': { state: 'connected', error_code: null, error_message: null, updated_at: '2026-10-13T01:00:00+00:00' },
      'campaigns:telegram': { state: 'connected', error_code: null, updated_at: '2026-10-13T01:00:00+00:00' },
      'social:telegram': { state: 'connected', error_code: null, updated_at: '2026-10-13T01:00:00+00:00' },
    },
  }));
  writeFileSync(path.join(home, 'personas', 'personas.json'), JSON.stringify({ tech: { character: 'Sadiq', voice: 'v' }, campaigns: { character: 'Dwight Schrute' } }));
  writeFileSync(path.join(home, 'profiles', 'tech', 'config.yaml'), TECH_CONFIG);
  writeFileSync(path.join(home, 'profiles', 'campaigns', 'config.yaml'), 'platforms:\n  telegram:\n    enabled: true\n');
  writeFileSync(path.join(home, 'profiles', 'tech', 'cron', 'jobs.json'), JSON.stringify({ jobs: [{ id: 'j1', name: 'ops-heartbeat', enabled: true, schedule_display: '0 9 * * *', last_status: 'ok', prompt: 'PRIVATE' }] }));
  writeFileSync(path.join(home, '.env'), 'TELEGRAM_BOT_TOKEN=123:SECRET\n');
  kanbanDb(path.join(home, 'kanban.db'));
  stateDb(path.join(home, 'profiles', 'tech', 'state.db'), {
    sessions: [
      ['s_ops', 'telegram', 'u1', OPS_CHAT, 'group', 'Paper Ops', T0 - 7200, 'Set up new Ops room', T0 - 100],
      ['s_dm', 'telegram', 'u1', DM_CHAT, 'dm', 'Jan', T0 - 9000, 'DM chat', T0 - 8000],
      ['s_os', 'cli', null, null, null, null, T0 - 50, 'dmos-ops', T0 - 40],
      ['s_cron', 'cron', null, null, null, null, T0 - 20_000, null, T0 - 19_000],
    ],
    messages: [
      ['s_ops', 'user', '[Jan Levinson] How is the copier?', null, T0 - 300, '901', 1, null, 'u_a'],
      ['s_ops', 'assistant', 'Checking the logs.', '[{"id":"call"}]', T0 - 290, null, 1, null, 'u_b'],
      ['s_ops', 'tool', '{"output":"secret tool output"}', null, T0 - 285, null, 1, null, 'u_c'],
      ['s_ops', 'assistant', 'Copier is fine.', null, T0 - 280, null, 1, null, 'u_d'],
      ['s_ops', 'user', 'internal note', null, T0 - 270, null, 1, 'internal_notification', 'u_e'],
      ['s_ops', 'assistant', 'old compacted text', null, T0 - 260, null, 0, null, 'u_f'],
      ['s_dm', 'user', 'dm hello', null, T0 - 8500, '5', 1, null, 'u_g'],
      ['s_os', 'user', '[Ops room] From the OS', null, T0 - 45, null, 1, null, 'u_h'],
      ['s_os', 'assistant', 'OS reply', null, T0 - 40, null, 1, null, 'u_i'],
    ],
  });
  return home;
}
