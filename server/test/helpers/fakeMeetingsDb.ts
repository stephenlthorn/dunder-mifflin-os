// A throwaway kanban.db with the tables and columns the meetings reader uses (names as in Hermes 0.21).
import { DatabaseSync } from 'node:sqlite';

export const MT0 = 1_800_000_000;
export const OPS_CHAT_ID = '-1009990001';

const SCHEMA = `
CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT, assignee TEXT, status TEXT NOT NULL, created_by TEXT,
  created_at INTEGER NOT NULL, started_at INTEGER, completed_at INTEGER, tenant TEXT, last_heartbeat_at INTEGER, result TEXT);
CREATE TABLE task_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, profile TEXT, status TEXT NOT NULL,
  started_at INTEGER NOT NULL, ended_at INTEGER, outcome TEXT, last_heartbeat_at INTEGER, summary TEXT, metadata TEXT, error TEXT);
CREATE TABLE task_links (parent_id TEXT NOT NULL, child_id TEXT NOT NULL, PRIMARY KEY (parent_id, child_id));
CREATE TABLE kanban_notify_subs (task_id TEXT NOT NULL, platform TEXT NOT NULL, chat_id TEXT NOT NULL, thread_id TEXT NOT NULL DEFAULT '',
  user_id TEXT, chat_type TEXT, notifier_profile TEXT, delivery_mode TEXT NOT NULL DEFAULT 'notify', created_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, platform, chat_id, thread_id));`;
const COMMENTS = 'CREATE TABLE task_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL);';
const EVENTS = 'CREATE TABLE task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, run_id INTEGER, kind TEXT NOT NULL, payload TEXT, created_at INTEGER NOT NULL);';

type Row = Array<string | number | null>;

/** `withHistory: false` leaves out task_comments and task_events (older Hermes). */
export function makeMeetingsDb(file: string, opts: { withHistory?: boolean } = {}): void {
  const db = new DatabaseSync(file);
  db.exec(SCHEMA + (opts.withHistory === false ? '' : COMMENTS + EVENTS));
  const t = db.prepare('INSERT INTO tasks (id,title,body,assignee,status,created_by,created_at,started_at,completed_at,last_heartbeat_at,result) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const tasks: Row[] = [
    ['t_c1', 'Council 2027-01-15: round 1 cmo', 'PRIVATE BODY', 'cmo', 'done', 'council', MT0, MT0 + 60, MT0 + 600, MT0 + 590, 'PRIVATE RESULT'],
    ['t_c2', 'Council 2027-01-15: round 1 cfo', null, 'cfo', 'done', 'council', MT0 + 5, MT0 + 90, MT0 + 700, null, null],
    ['t_ops', 'Restock the copier paper', null, 'campaigns', 'blocked', 'worker', MT0 + 7200, MT0 + 7260, null, MT0 + 7300, null],
    ['t_solo', 'A private card', null, 'tech', 'done', 'user', MT0 + 3600, MT0 + 3600, MT0 + 3700, null, null],
    ['t_old', 'Council 2026-11-01: old', null, 'cmo', 'done', 'council', MT0 - 90 * 86_400, null, MT0 - 90 * 86_400 + 60, null, null],
    ['t_la', 'Draft the launch post', null, 'social', 'todo', 'user', MT0 + 9000, null, null, null, null],
    ['t_lb', 'Approve the launch post', null, 'chief', 'todo', 'user', MT0 + 9000, null, null, null, null],
    ['t_os', 'Order toner', null, 'campaigns', 'todo', 'dmos-ops', MT0 + 9500, null, null, null, null],
  ];
  for (const r of tasks) t.run(...r);
  const run = db.prepare('INSERT INTO task_runs (task_id,profile,status,started_at,ended_at,outcome,summary,metadata,error) VALUES (?,?,?,?,?,?,?,?,?)');
  run.run('t_c1', 'cmo', 'done', MT0 + 60, MT0 + 600, 'completed', 'Raise prices 5%.', '{"secret":"PRIVATE META"}', null);
  run.run('t_c2', 'cfo', 'done', MT0 + 90, MT0 + 700, 'completed', 'Margins support 3%.', null, null);
  run.run('t_ops', 'campaigns', 'crashed', MT0 + 7260, MT0 + 7300, 'crashed', null, null, 'Traceback PRIVATE ERROR');
  db.prepare('INSERT INTO task_links (parent_id, child_id) VALUES (?,?)').run('t_la', 't_lb');
  db.prepare('INSERT INTO kanban_notify_subs (task_id,platform,chat_id,chat_type,notifier_profile,created_at) VALUES (?,?,?,?,?,?)')
    .run('t_ops', 'telegram', OPS_CHAT_ID, 'group', 'tech', MT0 + 7200);
  if (opts.withHistory !== false) {
    db.prepare('INSERT INTO task_comments (task_id,author,body,created_at) VALUES (?,?,?,?)').run('t_ops', 'user', 'Please hurry.', MT0 + 7400);
    const ev = db.prepare('INSERT INTO task_events (task_id,run_id,kind,payload,created_at) VALUES (?,?,?,?,?)');
    ev.run('t_c1', 1, 'claimed', '{"lock":"PRIVATE LOCK","run_id":1}', MT0 + 60);
    ev.run('t_c1', 1, 'heartbeat', '{"note":"PRIVATE NOTE"}', MT0 + 300);
    ev.run('t_c1', 1, 'completed', '{"summary":"PRIVATE SUMMARY"}', MT0 + 600);
    ev.run('t_ops', null, 'blocked', '{"reason":"Out of paper","actor":"PRIVATE ACTOR"}', MT0 + 7350);
    ev.run('t_ops', null, 'blocked', 'not json', MT0 + 7360);
  }
  db.close();
}
