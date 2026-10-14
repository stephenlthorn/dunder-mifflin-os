// The live timeline/usage readers against a fake HERMES_HOME shaped like Hermes 0.21 (read-only access).
import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createLiveActivity } from '../../src/hermes/liveActivity.ts';
import { A0, makeFakeActivityHome } from '../helpers/fakeActivityHome.ts';

const home = makeFakeActivityHome();
afterAll(() => rmSync(home, { recursive: true, force: true }));
const live = createLiveActivity({ hermesHome: home });
const DAY = 86_400;

describe('readActivity (live)', () => {
  it('reads conversation sessions, leaving cron and kanban sessions to their runs', async () => {
    const a = await live.readActivity('campaigns', A0 - DAY, 100);
    expect(a?.sessions.map((s) => s.id).sort()).toEqual(['s_new', 's_tg']);
    expect(a?.sessions.find((s) => s.id === 's_new')).toMatchObject({ source: 'cli', endedAt: A0 - 900, endReason: 'cli_close', messageCount: 2 });
  });

  it('reads messages in and out, but not cron prompts, internal notes, summaries or tool-calling turns', async () => {
    const a = await live.readActivity('campaigns', A0 - DAY, 100);
    expect(a?.messages.map((m) => [m.role, m.source, m.text.slice(0, 14)])).toEqual([
      ['assistant', 'telegram', 'Fourteen new l'],
      ['user', 'telegram', '[Jan] How many'],
      ['assistant', 'cron', 'Digest sent: 3'],
    ]);
    for (const m of a?.messages ?? []) expect(m.text.length).toBeLessThanOrEqual(300);
  });

  it('folds each session\'s tool calls into one burst, most used tool first', async () => {
    const a = await live.readActivity('campaigns', A0 - DAY, 100);
    expect(a?.tools).toEqual([
      { sessionId: 's_tg', source: 'telegram', count: 3, tools: [{ name: 'mcp__crm__list_leads', count: 2 }, { name: 'terminal', count: 1 }], lastAt: A0 - 1170 },
      { sessionId: 's_cron', source: 'cron', count: 1, tools: [{ name: 'web_search', count: 1 }], lastAt: A0 - 2950 },
    ]);
  });

  it('reads its own kanban cards and runs, titles only', async () => {
    const a = await live.readActivity('campaigns', A0 - DAY, 100);
    expect(a?.tasks.map((t) => t.id).sort()).toEqual(['t_crash', 't_done', 't_new']);
    expect(a?.runs.map((r) => [r.taskId, r.outcome])).toEqual([['t_new', null], ['t_crash', 'crashed'], ['t_done', 'completed'], ['t_done', 'reclaimed']]);
    expect(JSON.stringify(a)).not.toMatch(/PRIVATE (BODY|SUMMARY)/);
  });

  it('reads finished cron runs with their job names, skipping running and old ones', async () => {
    const a = await live.readActivity('campaigns', A0 - DAY, 100);
    expect(a?.cron.map((c) => [c.id, c.jobName, c.ok, c.delivery])).toEqual([
      ['e6', null, true, 'delivered'],
      ['e3', expect.stringMatching(/^Weekly report/), false, null],
      ['e2', 'Lead digest', true, 'suppressed'],
      ['e1', 'Lead digest', true, 'delivered'],
    ]);
    expect(a?.cron.find((c) => c.id === 'e1')?.at).toBeCloseTo(A0 - 2900, 0);
    expect(a?.cron.find((c) => c.id === 'e3')?.error).toMatch(/^RuntimeError: quota/);
    expect(JSON.stringify(a?.cron)).not.toContain('PRIVATE');
  });

  it('reads ERROR and CRITICAL lines from errors.log in the window, not warnings or tracebacks', async () => {
    const a = await live.readActivity('campaigns', A0 - DAY, 100);
    expect(a?.errors.map((e) => [e.at, e.logger, e.message.slice(0, 20)])).toEqual([
      [A0 - 900, 'gateway.run', 'Gateway crashed'],
      [A0 - 1000, 'asyncio', 'Unclosed client sess'],
      [A0 - 1500, 'tools.mcp', 'MCP call failed sk-a'],
      [A0 - 1900, 'asyncio', 'Unclosed client sess'],
    ]);
  });

  it('honours since and limit, refuses unknown profiles and degrades to empty when files are missing', async () => {
    const recent = await live.readActivity('campaigns', A0 - 1000, 100);
    expect(recent?.messages).toEqual([]);
    expect(recent?.cron.map((c) => c.id)).toEqual(['e6', 'e3']);
    const one = await live.readActivity('campaigns', A0 - DAY, 1);
    expect(one?.cron).toHaveLength(1);
    expect(await live.readActivity('../etc', A0 - DAY, 10)).toBeNull();
    expect(await live.readActivity('not-a-bot', A0 - DAY, 10)).toBeNull();
    const empty = await live.readActivity('social', A0 - DAY, 10);
    expect(empty).toMatchObject({ sessions: [], messages: [], tools: [], cron: [], errors: [] });
  });
});

describe('readUsage (live)', () => {
  it('sums session_model_usage per model in the window, with the cost Hermes recorded', async () => {
    const rows = await live.readUsage('campaigns', A0 - DAY, A0 + 1);
    const byModel = Object.fromEntries((rows ?? []).map((r) => [r.model, r]));
    expect(Object.keys(byModel).sort()).toEqual(['MiniMax-M3', 'claude-opus-5-5', 'gpt-5.6-luna', 'gpt-6-luna']);
    expect(byModel['claude-opus-5-5']).toEqual({
      model: 'claude-opus-5-5', inputTokens: 1000, outputTokens: 500, cacheReadTokens: 20_000, cacheWriteTokens: 1000, reasoningTokens: 0, calls: 5,
      recordedCost: { amount: 0.25, kind: 'estimated' },
    });
    expect(byModel['MiniMax-M3']?.recordedCost).toBeUndefined();
    expect(byModel['gpt-6-luna']?.recordedCost).toEqual({ amount: 0, kind: 'included' });
  });

  it('is null without a state.db and falls back to the sessions table on older Hermes', async () => {
    expect(await live.readUsage('social', A0 - DAY, A0)).toBeNull();
    const dir = path.join(home, 'profiles', 'skool');
    mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(dir, 'state.db'));
    db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT, model TEXT, started_at REAL, last_activity_at REAL, input_tokens INTEGER,
      output_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER, reasoning_tokens INTEGER, api_call_count INTEGER,
      estimated_cost_usd REAL, actual_cost_usd REAL, cost_status TEXT, billing_mode TEXT)`);
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('a', 'cli', 'claude-sonnet-5', A0 - 100, A0 - 50, 10, 20, 30, 40, 0, 2, 0, 0.5, 'actual', '');
    db.close();
    expect(await live.readUsage('skool', A0 - DAY, A0)).toEqual([{
      model: 'claude-sonnet-5', inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40, reasoningTokens: 0, calls: 2,
      recordedCost: { amount: 0.5, kind: 'actual' },
    }]);
  });
});
