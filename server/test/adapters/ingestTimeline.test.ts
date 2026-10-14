// Timelines of the push adapters: what a webhook agent posted, and what a Claude Code session's hooks said.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createTimelineLog } from '../../src/adapters/ingest/timelineLog.ts';
import { createWebhookAdapter } from '../../src/adapters/webhook.ts';
import { createClaudeCodeAdapter } from '../../src/adapters/claudeCode/adapter.ts';
import type { AgentAdapter } from '../../src/adapters/types.ts';

const TOKEN = 'test-ingest-token-0123456789abcdef';
const T0 = Date.parse('2026-10-13T15:00:00.000Z');
const SINCE = { since: '2026-10-13T00:00:00.000Z', limit: 100 };
const post = (a: AgentAdapter, agentId: string, body: unknown) => a.routes![0]!.handle({ params: [agentId], body });
const hook = (a: AgentAdapter, body: unknown) => a.routes![0]!.handle({ params: [], body });
const SESSION = JSON.parse(readFileSync(new URL('../fixtures/claude-code/session.json', import.meta.url), 'utf8')).payloads as Array<Record<string, unknown>>;

describe('createTimelineLog', () => {
  it('keeps the newest events per agent, newest first, folding exact repeats into a count', () => {
    let alive = true;
    const log = createTimelineLog({ perAgent: 3, isAlive: () => alive });
    const at = (s: number) => new Date(T0 + s * 1000).toISOString();
    log.add('a', { at: at(1), kind: 'activity', title: 'Reading a.ts' });
    log.add('a', { at: at(2), kind: 'activity', title: 'Reading a.ts' });
    log.add('a', { at: at(3), kind: 'activity', title: 'Reading b.ts' });
    log.add('a', { at: at(4), kind: 'status', title: 'Idle' });
    log.add('a', { at: at(5), kind: 'error', title: 'Boom' });
    const events = log.read('a', SINCE)!;
    expect(events.map((e) => [e.title, e.count])).toEqual([['Boom', undefined], ['Idle', undefined], ['Reading b.ts', undefined]]);
    expect(log.read('a', { since: at(4), limit: 10 })!.map((e) => e.title)).toEqual(['Boom', 'Idle']);
    expect(log.read('a', { since: SINCE.since, limit: 1 })).toHaveLength(1);
    const fold = createTimelineLog({ isAlive: () => true });
    fold.add('b', { at: at(1), kind: 'activity', title: 'Reading a.ts' });
    fold.add('b', { at: at(2), kind: 'activity', title: 'Reading a.ts' });
    expect(fold.read('b', SINCE)).toEqual([{ id: expect.any(String), at: at(2), kind: 'activity', title: 'Reading a.ts', count: 2 }]);
    alive = false;
    expect(log.read('a', SINCE)).toBeNull();
  });
});

describe('webhook timeline: the events an agent posted', () => {
  it('records statuses, activity, tasks and messages as timeline events, scrubbed', async () => {
    let t = T0;
    const a = createWebhookAdapter({ token: TOKEN, now: () => t });
    const step = (body: unknown) => { t += 1000; expect(post(a, 'deploy-bot', body)).toEqual({ status: 204 }); };
    step({ type: 'status', status: 'working', activity: 'Deploying v2' });
    step({ type: 'activity', text: 'Running migrations' });
    step({ type: 'task', id: 'd-1', title: 'Ship v2', status: 'doing' });
    step({ type: 'task', id: 'd-1', title: 'Ship v2', status: 'done' });
    step({ type: 'task', id: 'd-2', title: 'Rotate keys', status: 'todo' });
    step({ type: 'task', id: 'd-3', title: 'Fix CI', status: 'blocked' });
    step({ type: 'message', text: 'Deployed.\nKey sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123 rotated' });
    step({ type: 'status', status: 'error', activity: 'Health check failed' });
    step({ type: 'approval', id: 'r-1', title: 'Deploy to production?' });
    step({ type: 'approval-withdrawn', id: 'r-1' });
    const events = (await a.timeline!('deploy-bot', SINCE))!;
    expect(events.map((e) => [e.kind, e.title, e.detail])).toEqual([
      ['status', 'Withdrew an approval request', undefined],
      ['status', 'Asked for your approval', 'Deploy to production?'],
      ['error', 'Health check failed', undefined],
      ['message.out', 'Deployed. Key [secret] rotated', undefined],
      ['task.blocked', 'Fix CI', undefined],
      ['task.created', 'Rotate keys', undefined],
      ['task.finished', 'Ship v2', undefined],
      ['task.started', 'Ship v2', undefined],
      ['activity', 'Running migrations', undefined],
      ['status', 'Working', 'Deploying v2'],
    ]);
    expect(events.every((e) => e.source === 'webhook')).toBe(true);
    expect(await a.timeline!('nobody', SINCE)).toBeNull();
    expect(a.usage).toBeUndefined(); // webhook agents report no tokens: the ledger says so
  });
});

describe('claude-code timeline: a session\'s hook events', () => {
  it('replays a recorded session into prompts, tool calls, a permission wait and the answer, never the prompt text', async () => {
    let t = T0;
    const a = createClaudeCodeAdapter({ token: TOKEN, now: () => t });
    for (const p of SESSION) {
      t += 1000;
      hook(a, p);
    }
    const events = (await a.timeline!('paper-site', SINCE))!;
    const kinds = events.map((e) => e.kind).reverse();
    expect(kinds[0]).toBe('session.started');
    expect(kinds).toContain('message.in');
    expect(kinds).toContain('tool.call');
    expect(kinds).toContain('status');
    expect(kinds).toContain('message.out');
    expect(kinds.at(-1)).toBe('session.ended');
    expect(events.find((e) => e.kind === 'message.in')?.title).toBe('You sent a prompt');
    expect(events.find((e) => e.kind === 'message.out')?.title).toMatch(/^Fixed the checkout test/);
    expect(events.filter((e) => e.kind === 'tool.call').map((e) => e.title)).toContain('Running: Run the checkout tests');
    expect(JSON.stringify(events)).not.toMatch(/home\/dev|sk-ant|sk_live|STRIPE|npm test|TOP-SECRET|Fix the failing/);
    expect(events.every((e) => e.source === 'claude-code')).toBe(true);
    expect(a.usage).toBeUndefined();
  });
});
