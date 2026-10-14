// What on the Hermes kanban board waits on a human, read-only: blocked cards, review cards and triage cards, with the
// reason from their latest blocked / block_loop_detected / review_requested event and their latest comment.
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readKanbanWaiting } from '../src/hermes/kanbanWaiting.ts';

const T0 = 1_800_000_000;
const root = mkdtempSync(path.join(tmpdir(), 'dmos-waiting-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function board(name: string, opts: { blockKind?: boolean; comments?: boolean; events?: boolean } = {}): string {
  const file = path.join(root, `${name}.db`);
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, assignee TEXT, status TEXT NOT NULL, created_by TEXT,
    created_at INTEGER NOT NULL${opts.blockKind === false ? '' : ', block_kind TEXT'})`);
  if (opts.events !== false) db.exec('CREATE TABLE task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, run_id INTEGER, kind TEXT NOT NULL, payload TEXT, created_at INTEGER NOT NULL)');
  if (opts.comments !== false) db.exec('CREATE TABLE task_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL)');
  const cols = opts.blockKind === false ? 'id,title,assignee,status,created_by,created_at' : 'id,title,assignee,status,created_by,created_at,block_kind';
  const task = db.prepare(`INSERT INTO tasks (${cols}) VALUES (${cols.split(',').map(() => '?').join(',')})`);
  const rows: Array<Array<string | number | null>> = [
    ['t_ask', 'Send the client list?', 'campaigns', 'blocked', 'chief', T0 - 900, 'needs_input'],
    ['t_mine', 'Publish the Dundies program', 'jan', 'blocked', 'party-planner', T0 - 800, null],
    ['t_rev', 'Review the landing page', null, 'review', 'tech', T0 - 700, null],
    ['t_loop', 'Flaky deploy', 'tech', 'triage', 'tech', T0 - 600, 'transient'],
    ['t_run', 'Running card', 'tech', 'running', 'tech', T0 - 500, null],
    ['t_done', 'Done card', 'tech', 'done', 'tech', T0 - 400, null],
  ];
  for (const r of rows) task.run(...(opts.blockKind === false ? r.slice(0, 6) : r));
  if (opts.events !== false) {
    const ev = db.prepare('INSERT INTO task_events (task_id, kind, payload, created_at) VALUES (?,?,?,?)');
    ev.run('t_ask', 'blocked', JSON.stringify({ reason: 'old reason', kind: 'needs_input' }), T0 - 880);
    ev.run('t_ask', 'blocked', JSON.stringify({ reason: 'You paused outreach last week. Load anyway?', kind: 'needs_input', recurrences: 1 }), T0 - 850);
    ev.run('t_ask', 'heartbeat', '{}', T0 - 10);
    ev.run('t_rev', 'review_requested', JSON.stringify({ summary: 'Hero copy rewritten; tests pass' }), T0 - 650);
    ev.run('t_loop', 'block_loop_detected', JSON.stringify({ reason: 'deploy keeps timing out', kind: 'transient', recurrences: 2, limit: 2 }), T0 - 550);
    ev.run('t_mine', 'blocked', 'not json', T0 - 790);
  }
  if (opts.comments !== false) {
    const c = db.prepare('INSERT INTO task_comments (task_id, author, body, created_at) VALUES (?,?,?,?)');
    c.run('t_mine', 'chief', 'The draft is ready in the content plan.', T0 - 780);
    c.run('t_ask', 'campaigns', 'first', T0 - 870);
    c.run('t_ask', 'campaigns', 'Waiting on your go-ahead.', T0 - 840);
  }
  db.close();
  return file;
}

describe('readKanbanWaiting', () => {
  it('reads blocked, review and triage cards with their latest reason, event time and comment', () => {
    const waiting = readKanbanWaiting(board('full'));
    expect(waiting?.map((w) => w.id)).toEqual(['t_loop', 't_rev', 't_mine', 't_ask']);
    expect(waiting?.find((w) => w.id === 't_ask')).toEqual({
      id: 't_ask', title: 'Send the client list?', status: 'blocked', assignee: 'campaigns', createdBy: 'chief', blockKind: 'needs_input',
      event: 'blocked', reason: 'You paused outreach last week. Load anyway?', since: T0 - 850, comment: 'Waiting on your go-ahead.',
    });
    expect(waiting?.find((w) => w.id === 't_rev')).toMatchObject({ event: 'review_requested', reason: 'Hero copy rewritten; tests pass', since: T0 - 650, assignee: null });
    expect(waiting?.find((w) => w.id === 't_loop')).toMatchObject({ event: 'block_loop_detected', reason: 'deploy keeps timing out' });
    expect(waiting?.find((w) => w.id === 't_mine')).toMatchObject({ event: 'blocked', reason: null, since: T0 - 790, comment: 'The draft is ready in the content plan.' });
  });

  it('copes with older boards: no block_kind column, no comments or events tables', () => {
    const waiting = readKanbanWaiting(board('old', { blockKind: false, comments: false, events: false }));
    expect(waiting?.find((w) => w.id === 't_ask')).toEqual({
      id: 't_ask', title: 'Send the client list?', status: 'blocked', assignee: 'campaigns', createdBy: 'chief', blockKind: null,
      event: null, reason: null, since: T0 - 900, comment: null,
    });
  });

  it('returns null without a board', () => {
    expect(readKanbanWaiting(path.join(root, 'missing.db'))).toBeNull();
  });
});
