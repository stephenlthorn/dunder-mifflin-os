// A throwaway HERMES_HOME with the tables the timeline and usage readers use, shaped like Hermes 0.21 (state.db
// schema 31: sessions + messages + session_model_usage; kanban.db tasks + task_runs; cron/executions.db; logs).
// Every free-text field carries a secret, so the tests can prove nothing leaks.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const A0 = 1_800_000_000; // "now" in the fake data, epoch seconds
export const SECRET = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123 call +1 570 555 0123 in /Users/jane.doe/x';

const STATE = `
CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT NOT NULL, chat_id TEXT, model TEXT, started_at REAL NOT NULL, ended_at REAL,
  end_reason TEXT, message_count INTEGER DEFAULT 0, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0, cache_write_tokens INTEGER DEFAULT 0, reasoning_tokens INTEGER DEFAULT 0, billing_mode TEXT,
  estimated_cost_usd REAL, actual_cost_usd REAL, cost_status TEXT, title TEXT, last_activity_at REAL, api_call_count INTEGER DEFAULT 0);
CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT, tool_calls TEXT,
  tool_name TEXT, timestamp REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1, display_kind TEXT, _compressed_summary INTEGER NOT NULL DEFAULT 0);
CREATE TABLE session_model_usage (session_id TEXT NOT NULL, model TEXT NOT NULL, billing_provider TEXT NOT NULL DEFAULT '',
  billing_base_url TEXT NOT NULL DEFAULT '', billing_mode TEXT NOT NULL DEFAULT '', task TEXT NOT NULL DEFAULT '', api_call_count INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0, reasoning_tokens INTEGER NOT NULL DEFAULT 0, estimated_cost_usd REAL NOT NULL DEFAULT 0,
  actual_cost_usd REAL NOT NULL DEFAULT 0, cost_status TEXT, cost_source TEXT, first_seen REAL, last_seen REAL,
  PRIMARY KEY (session_id, model, billing_provider, billing_base_url, billing_mode, task));`;

const KANBAN = `
CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT, assignee TEXT, status TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE task_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, profile TEXT, status TEXT NOT NULL, started_at INTEGER NOT NULL,
  ended_at INTEGER, outcome TEXT, summary TEXT, error TEXT);`;

const EXECUTIONS = `
CREATE TABLE executions (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, source TEXT NOT NULL, process_id TEXT NOT NULL, pid INTEGER NOT NULL,
  status TEXT NOT NULL, claimed_at TEXT NOT NULL, started_at TEXT, finished_at TEXT, error TEXT, delivery_outcome TEXT);`;

type Cell = string | number | null;
function db(file: string, schema: string, inserts: ReadonlyArray<readonly [string, ReadonlyArray<ReadonlyArray<Cell>>]>): void {
  const d = new DatabaseSync(file);
  d.exec(schema);
  for (const [sql, rows] of inserts) {
    const stmt = d.prepare(sql);
    for (const r of rows) stmt.run(...r);
  }
  d.close();
}

/** ISO with a -04:00 offset, like Hermes' cron executions. */
export function offsetIso(epoch: number): string {
  return `${new Date((epoch - 4 * 3600) * 1000).toISOString().replace('Z', '')}-04:00`;
}

/** The same wall-clock time errors.log would print on this machine. */
export function logStamp(epoch: number): string {
  const d = new Date(epoch * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())},${p(d.getMilliseconds(), 3)}`;
}

export function makeFakeActivityHome(): string {
  const home = mkdtempSync(path.join(tmpdir(), 'dmos-activity-'));
  const p = (...parts: string[]) => path.join(home, 'profiles', 'campaigns', ...parts);
  mkdirSync(p('cron'), { recursive: true });
  mkdirSync(p('logs'), { recursive: true });
  db(p('state.db'), STATE, [
    ['INSERT INTO sessions (id,source,chat_id,model,started_at,ended_at,end_reason,message_count,title,last_activity_at,input_tokens,output_tokens) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [
      ['s_tg', 'telegram', '-1001234567890', 'claude-opus-5-5', A0 - 7200, null, null, 4, `Leads chat ${SECRET}`, A0 - 600, 10, 10],
      ['s_cron', 'cron', null, 'MiniMax-M3', A0 - 3000, A0 - 2900, 'cron_complete', 6, 'Lead digest', A0 - 2900, 10, 10],
      ['s_cli', 'cli', null, 'claude-opus-5-5', A0 - 200_000, A0 - 199_000, 'cli_close', 2, 'Old session', A0 - 199_000, 10, 10],
      ['s_new', 'cli', null, 'claude-opus-5-5', A0 - 1000, A0 - 900, 'cli_close', 2, null, A0 - 900, 10, 10],
    ]],
    ['INSERT INTO messages (session_id,role,content,tool_calls,tool_name,timestamp,active,display_kind,_compressed_summary) VALUES (?,?,?,?,?,?,?,?,?)', [
      ['s_tg', 'user', `[Jan] How many leads today?\nAlso ${SECRET}`, null, null, A0 - 1200, 1, null, 0],
      ['s_tg', 'assistant', null, '[{"id":"c1"}]', null, A0 - 1190, 1, null, 0],
      ['s_tg', 'tool', '{"secret":"tool output"}', null, 'terminal', A0 - 1185, 1, null, 0],
      ['s_tg', 'tool', '{}', null, 'mcp__crm__list_leads', A0 - 1180, 1, null, 0],
      ['s_tg', 'tool', '{}', null, 'mcp__crm__list_leads', A0 - 1170, 0, null, 0],
      ['s_tg', 'assistant', `Fourteen new leads. ${SECRET}`, '[]', null, A0 - 1160, 1, null, 0],
      ['s_tg', 'user', 'internal ping', null, null, A0 - 1150, 1, 'internal_notification', 0],
      ['s_tg', 'assistant', 'Summary of earlier turns', null, null, A0 - 1140, 1, null, 1],
      ['s_cron', 'user', 'PRIVATE CRON PROMPT: run the lead digest', null, null, A0 - 3000, 1, null, 0],
      ['s_cron', 'tool', '{}', null, 'web_search', A0 - 2950, 1, null, 0],
      ['s_cron', 'assistant', 'Digest sent: 3 hot leads.', null, null, A0 - 2900, 1, null, 0],
      ['s_cli', 'user', 'too old to show', null, null, A0 - 199_500, 1, null, 0],
    ]],
    ['INSERT INTO session_model_usage (session_id,model,billing_provider,billing_mode,task,api_call_count,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,reasoning_tokens,estimated_cost_usd,actual_cost_usd,cost_status,first_seen,last_seen) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
      ['s_tg', 'claude-opus-5-5', 'anthropic', '', '', 5, 1000, 500, 20_000, 1000, 0, 0.25, 0, 'estimated', A0 - 7000, A0 - 600],
      ['s_tg', 'gpt-5.6-luna', 'openai-codex', '', 'title_generation', 1, 300, 20, 0, 0, 0, 0, 0, null, A0 - 7000, A0 - 7000],
      ['s_cron', 'MiniMax-M3', 'minimax-oauth', '', '', 4, 40_000, 2000, 300_000, 0, 0, 0, 0, 'unknown', A0 - 3000, A0 - 2900],
      ['s_new', 'gpt-6-luna', 'openai-codex', 'subscription_included', '', 2, 5000, 100, 0, 0, 50, 0, 0, 'included', A0 - 1000, A0 - 900],
      ['s_cli', 'claude-opus-5-5', 'anthropic', '', '', 9, 9_000_000, 9, 9, 9, 0, 99, 0, 'estimated', A0 - 200_000, A0 - 199_000],
    ]],
  ]);
  db(path.join(home, 'kanban.db'), KANBAN, [
    ['INSERT INTO tasks (id,title,body,assignee,status,created_at) VALUES (?,?,?,?,?,?)', [
      ['t_new', `Call the Scranton prospects ${SECRET}`, 'PRIVATE BODY', 'campaigns', 'ready', A0 - 500],
      ['t_done', 'Weekly campaign report', 'PRIVATE BODY', 'campaigns', 'done', A0 - 9000],
      ['t_crash', 'Refresh the client list', null, 'campaigns', 'ready', A0 - 9000],
      ['t_other', 'Somebody else', null, 'tech', 'ready', A0 - 400],
    ]],
    ['INSERT INTO task_runs (task_id,profile,status,started_at,ended_at,outcome,summary,error) VALUES (?,?,?,?,?,?,?,?)', [
      ['t_done', 'campaigns', 'done', A0 - 5000, A0 - 4000, 'completed', 'PRIVATE SUMMARY', null],
      ['t_crash', 'campaigns', 'crashed', A0 - 3500, A0 - 3400, 'crashed', null, `Traceback ${SECRET}`],
      ['t_new', 'campaigns', 'running', A0 - 100, null, null, null, null],
      ['t_other', 'tech', 'running', A0 - 100, null, null, null, null],
      ['t_done', 'campaigns', 'reclaimed', A0 - 6000, A0 - 5500, 'reclaimed', null, null],
    ]],
  ]);
  writeFileSync(p('cron', 'jobs.json'), JSON.stringify({ jobs: [
    { id: 'j_digest', name: 'Lead digest', enabled: true, schedule_display: 'every 30m', prompt: 'PRIVATE' },
    { id: 'j_report', name: `Weekly report ${SECRET}`, enabled: true, schedule_display: '0 9 * * 1' },
  ] }));
  db(p('cron', 'executions.db'), EXECUTIONS, [
    ['INSERT INTO executions (id,job_id,source,process_id,pid,status,claimed_at,started_at,finished_at,error,delivery_outcome) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [
      ['e1', 'j_digest', 'builtin', 'p', 1, 'completed', offsetIso(A0 - 3000), offsetIso(A0 - 3000), offsetIso(A0 - 2900), null, 'delivered'],
      ['e2', 'j_digest', 'builtin', 'p', 1, 'completed', offsetIso(A0 - 1200), offsetIso(A0 - 1200), offsetIso(A0 - 1199), null, 'suppressed'],
      ['e3', 'j_report', 'builtin', 'p', 1, 'failed', offsetIso(A0 - 800), offsetIso(A0 - 800), offsetIso(A0 - 700), `RuntimeError: quota\n${SECRET}`, null],
      ['e4', 'j_digest', 'builtin', 'p', 1, 'running', offsetIso(A0 - 10), offsetIso(A0 - 10), null, null, null],
      ['e5', 'j_digest', 'builtin', 'p', 1, 'completed', offsetIso(A0 - 300_000), offsetIso(A0 - 300_000), offsetIso(A0 - 299_990), null, 'delivered'],
      ['e6', 'j_gone', 'builtin', 'p', 1, 'completed', offsetIso(A0 - 400), offsetIso(A0 - 400), offsetIso(A0 - 390), null, 'delivered'],
    ]],
  ]);
  writeFileSync(p('logs', 'errors.log'), [
    `${logStamp(A0 - 400_000)} ERROR gateway: far too old`,
    `${logStamp(A0 - 2000)} WARNING agent.aux: just a warning`,
    `${logStamp(A0 - 1900)} ERROR asyncio: Unclosed client session`,
    'Traceback (most recent call last):',
    `  File "/Users/jane.doe/x.py", line 1`,
    `${logStamp(A0 - 1500)} ERROR [cron_j_digest_1] tools.mcp: MCP call failed ${SECRET}`,
    `${logStamp(A0 - 1000)} ERROR asyncio: Unclosed client session`,
    `${logStamp(A0 - 900)} CRITICAL gateway.run: Gateway crashed`,
    '',
  ].join('\n'));
  return home;
}
