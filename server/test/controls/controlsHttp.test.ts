// POST /api/people/:id/actions and GET /api/budgets end to end, with a fake adapter: read-only refuses verbs (403),
// sign-in is required when a token is set (401), verbs are rate-limited (429) and audited with who asked, and
// Corporate pauses an over-budget bot only with autoPause on (audited as corporate).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { BudgetsReport, ControlReply } from '../../../shared/controls.ts';
import type { AgentAdapter } from '../../src/adapters/types.ts';
import type { BudgetConfig } from '../../src/budgets/config.ts';
import { createApp, type App } from '../../src/http/app.ts';
import { SESSION_COOKIE, sessionValue } from '../../src/http/auth.ts';
import { defaultOfficeSetup } from '../../src/office/office.ts';
import { mergeSeatRules } from '../../src/office/seating.ts';

const NOW = 1_800_000_000;
const TOKEN = 'controls-access-token-0123456789';
const DEV = 'http://localhost:5173';
const root = mkdtempSync(path.join(tmpdir(), 'dmos-controls-http-'));

function fakeAdapter(calls: string[]): AgentAdapter {
  const ok = (what: string) => async () => (calls.push(what), { ok: true as const, value: null });
  return {
    id: 'fake', kind: 'webhook', label: 'Fake',
    capabilities: { chat: false, createTask: false, approvals: false, pause: true, stop: true, runJob: false, reassign: false },
    snapshot: async () => ({ agents: [{ id: 'a1', role: 'Seller' }], presence: { a1: { status: 'working' } }, tasks: [], rooms: [] }),
    readMessages: async () => null,
    pause: ok('pause:a1'), resume: ok('resume:a1'), stop: ok('stop:a1'),
    usage: async () => ({ models: [{ model: 'house-model', inputTokens: 10, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, recordedCost: { amount: 25, kind: 'actual' } }] }),
  };
}

type Server = { app: App; base: string; calls: string[]; audit: string };
let n = 0;
async function start(opts: { allowWrites: boolean; token?: string; budgets?: BudgetConfig }): Promise<Server> {
  const calls: string[] = [];
  n += 1;
  const audit = path.join(root, `audit-${n}.log`);
  const app = createApp({
    adapters: [fakeAdapter(calls)], setup: defaultOfficeSetup(mergeSeatRules({}, { dwight: { adapter: 'fake', agent: 'a1' } })),
    hermesHome: root, headshotDir: root, pollIntervalMs: 60_000, now: () => NOW, allowWrites: opts.allowWrites, accessToken: opts.token ?? null,
    auditFile: audit, ...(opts.budgets ? { budgets: opts.budgets } : {}), budgetCheckMs: 0,
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  return { app, base: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`, calls, audit };
}

const post = (s: Server, personId: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${s.base}/api/people/${personId}/actions`, { method: 'POST', headers: { 'content-type': 'application/json', origin: DEV, ...headers }, body: JSON.stringify(body) });
const auditOf = (s: Server) => readFileSync(s.audit, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
const signedIn = { cookie: `${SESSION_COOKIE}=${sessionValue(TOKEN)}` };

let readOnly: Server;
let open: Server;
let guarded: Server;
let corporate: Server;
beforeAll(async () => {
  readOnly = await start({ allowWrites: false, budgets: { autoPause: true, limits: { dwight: { monthly: 20 } } } });
  open = await start({ allowWrites: true });
  guarded = await start({ allowWrites: true, token: TOKEN, budgets: { autoPause: false, limits: { dwight: { monthly: 20 } } } });
  corporate = await start({ allowWrites: true, budgets: { autoPause: true, limits: { dwight: { daily: 100, monthly: 20 } } } });
});
afterAll(async () => {
  await Promise.all([readOnly, open, guarded, corporate].map((s) => s.app.close()));
  rmSync(root, { recursive: true, force: true });
});

describe('POST /api/people/:id/actions', () => {
  it('is refused on a read-only server (403) without calling the adapter', async () => {
    const res = await post(readOnly, 'dwight', { action: 'pause' });
    expect(res.status).toBe(403);
    expect(readOnly.calls).toEqual([]);
  });

  it('requires sign-in when an access token is set (401), then acts and audits it as signed in', async () => {
    expect((await post(guarded, 'dwight', { action: 'stop' })).status).toBe(401);
    expect(guarded.calls).toEqual([]);
    const res = await post(guarded, 'dwight', { action: 'stop' }, signedIn);
    expect(res.status).toBe(200);
    expect(await res.json() as ControlReply).toEqual({ ok: true, action: 'stop', message: "Stopped Dwight Schrute's current run." });
    expect(guarded.calls).toEqual(['stop:a1']);
    expect(auditOf(guarded).map((e) => [e.event, e.action, e.actor])).toEqual([['control.request', 'stop', 'signed-in'], ['control.done', 'stop', undefined]]);
  });

  it('answers 400 for bad bodies, 404 for empty desks, 501 for verbs the adapter lacks, 415 without JSON', async () => {
    expect((await post(open, 'dwight', { action: 'self-destruct' })).status).toBe(400);
    expect((await post(open, 'pam', { action: 'pause' })).status).toBe(404);
    expect((await post(open, '..%2F..', { action: 'pause' })).status).toBe(404);
    const noJobs = await post(open, 'dwight', { action: 'run-job', args: { jobId: 'job1' } });
    expect(noJobs.status).toBe(501);
    expect(await noJobs.json()).toEqual({ error: "Fake agents can't run jobs from the office" });
    const plain = await fetch(`${open.base}/api/people/dwight/actions`, { method: 'POST', headers: { 'content-type': 'text/plain', origin: DEV }, body: 'pause' });
    expect(plain.status).toBe(415);
    expect(open.calls).toEqual([]);
  });

  it('pauses and resumes, one audit pair each', async () => {
    expect((await post(open, 'dwight', { action: 'pause' })).status).toBe(200);
    expect((await post(open, 'dwight', { action: 'resume' })).status).toBe(200);
    expect(open.calls).toEqual(['pause:a1', 'resume:a1']);
    expect(auditOf(open).map((e) => e.event)).toEqual(['control.request', 'control.done', 'control.request', 'control.done']);
  });

  it('is rate-limited: 20 a minute, then 429', async () => {
    const limited = await start({ allowWrites: true });
    try {
      for (let i = 0; i < 20; i += 1) expect((await post(limited, 'dwight', { action: 'nope' })).status).toBe(400);
      const res = await post(limited, 'dwight', { action: 'pause' });
      expect(res.status).toBe(429);
      expect(limited.calls).toEqual([]);
    } finally {
      await limited.app.close();
    }
  });
});

describe('GET /api/budgets', () => {
  it('answers on a read-only server too, but cannot freeze anyone there: an alert with the reason', async () => {
    const report = await (await fetch(`${readOnly.base}/api/budgets`)).json() as BudgetsReport;
    expect(report.budgets).toEqual([expect.objectContaining({ personId: 'dwight', level: 'over', action: 'alert', note: expect.stringMatching(/^Could not pause: Read-only mode/) })]);
    expect(readOnly.calls).toEqual([]);
  });

  it('requires sign-in when a token is set, and only alerts with autoPause off', async () => {
    expect((await fetch(`${guarded.base}/api/budgets`)).status).toBe(401);
    const report = await (await fetch(`${guarded.base}/api/budgets`, { headers: signedIn })).json() as BudgetsReport;
    expect(report).toMatchObject({ autoPause: false, currency: 'USD', budgets: [{ personId: 'dwight', level: 'over', action: 'alert' }] });
    expect(report.budgets[0]!.lines).toEqual([expect.objectContaining({ period: 'monthly', limit: 20, spent: 25, ratio: 1.25 })]);
  });

  it('freezes an over-budget bot with autoPause on: paused once, audited as corporate with the reason', async () => {
    const report = await (await fetch(`${corporate.base}/api/budgets`)).json() as BudgetsReport;
    expect(report.budgets[0]).toMatchObject({ personId: 'dwight', level: 'over', action: 'paused' });
    expect(report.budgets[0]!.lines.map((l) => [l.period, l.level])).toEqual([['daily', 'ok'], ['monthly', 'over']]);
    expect(corporate.calls).toEqual(['pause:a1']);
    expect(auditOf(corporate)[0]).toMatchObject({ event: 'control.request', action: 'pause', actor: 'corporate', reason: 'Over its monthly budget ($25.00 of $20.00)' });
  });

  it('answers an empty report without budgets, and is rate-limited', async () => {
    expect(await (await fetch(`${open.base}/api/budgets`)).json()).toMatchObject({ budgets: [], autoPause: false });
    let last = 200;
    for (let i = 0; i < 61 && last === 200; i += 1) last = (await fetch(`${open.base}/api/budgets`)).status;
    expect(last).toBe(429);
  });
});
