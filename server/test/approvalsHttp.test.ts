// GET /api/approvals and POST /api/approvals/:id end to end: read-only refuses (403), sign-in is required when a
// token is set (401), the decision reaches the adapter once, and the audit log records who decided what.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Approval, OfficeSnapshot } from '../../shared/contract.ts';
import type { AgentAdapter, ApprovalRequest } from '../src/adapters/types.ts';
import { createApp, type App } from '../src/http/app.ts';
import { SESSION_COOKIE, sessionValue } from '../src/http/auth.ts';
import { defaultOfficeSetup } from '../src/office/office.ts';
import { mergeSeatRules } from '../src/office/seating.ts';

const NOW = 1_800_000_000;
const AT = new Date(NOW * 1000).toISOString();
const TOKEN = 'approvals-access-token-0123456789';
const DEV = 'http://localhost:5173';
const root = mkdtempSync(path.join(tmpdir(), 'dmos-approvals-http-'));

function fakeAdapter() {
  let pending: ReadonlyArray<ApprovalRequest> = [{ id: 'ap-1', agentId: 'a1', kind: 'permission', title: 'Run the deploy?', requestedAt: AT, risk: 'high' }];
  const calls: string[] = [];
  const adapter: AgentAdapter = {
    id: 'fake', kind: 'webhook', label: 'Fake', capabilities: { chat: false, createTask: false, approvals: true, pause: false, stop: false },
    snapshot: async () => ({ agents: [{ id: 'a1', role: 'Deployer' }], presence: { a1: { status: 'working' } }, tasks: [], rooms: [], approvals: pending }),
    readMessages: async () => null,
    listApprovals: async () => pending,
    resolveApproval: async (id, d) => {
      calls.push(`${id}:${d.approve}`);
      pending = pending.filter((p) => p.id !== id);
      return { ok: true, value: null };
    },
  };
  return { adapter, calls };
}

type Server = { app: App; base: string; calls: string[]; audit: string };
async function start(opts: { allowWrites: boolean; token?: string }): Promise<Server> {
  const { adapter, calls } = fakeAdapter();
  const audit = path.join(root, `${opts.allowWrites}-${opts.token ? 'token' : 'open'}.log`);
  const app = createApp({
    adapters: [adapter], setup: defaultOfficeSetup(mergeSeatRules({}, { toby: null, jim: { adapter: 'fake', agent: 'a1' } })),
    hermesHome: root, headshotDir: root, pollIntervalMs: 60_000, now: () => NOW, allowWrites: opts.allowWrites, accessToken: opts.token ?? null, auditFile: audit,
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  return { app, base: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`, calls, audit };
}

const decide = (s: Server, id: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${s.base}/api/approvals/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: DEV, ...headers }, body: JSON.stringify(body) });

let readOnly: Server;
let open: Server;
let guarded: Server;
beforeAll(async () => {
  readOnly = await start({ allowWrites: false });
  open = await start({ allowWrites: true });
  guarded = await start({ allowWrites: true, token: TOKEN });
});
afterAll(async () => {
  await Promise.all([readOnly, open, guarded].map((s) => s.app.close()));
  rmSync(root, { recursive: true, force: true });
});

describe('the approvals API', () => {
  it('lists pending approvals, also read-only, and puts them in the office snapshot (the bot needs you)', async () => {
    const list = (await (await fetch(`${readOnly.base}/api/approvals`)).json()) as Approval[];
    expect(list).toEqual([expect.objectContaining({ id: 'fake:ap-1', personId: 'jim', from: 'Jim Halpert', risk: 'high', decidable: true })]);
    const snap = (await (await fetch(`${readOnly.base}/api/office`)).json()) as OfficeSnapshot;
    expect(snap.approvals?.map((a) => a.id)).toEqual(['fake:ap-1']);
    expect(snap.presence.jim).toMatchObject({ status: 'needs-input', activity: 'Run the deploy?' });
  });

  it('refuses decisions on a read-only server (403) without calling the adapter', async () => {
    const res = await decide(readOnly, 'fake:ap-1', { decision: 'approve' });
    expect(res.status).toBe(403);
    expect(readOnly.calls).toEqual([]);
  });

  it('requires sign-in when an access token is set (401), then decides and audits it as signed in', async () => {
    expect((await decide(guarded, 'fake:ap-1', { decision: 'approve' })).status).toBe(401);
    expect(guarded.calls).toEqual([]);
    const res = await decide(guarded, 'fake:ap-1', { decision: 'approve', note: 'ship it' }, { cookie: `${SESSION_COOKIE}=${sessionValue(TOKEN)}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(guarded.calls).toEqual(['ap-1:true']);
    const entries = readFileSync(guarded.audit, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(entries.map((e) => [e.event, e.actor])).toEqual([['approval.decide', 'signed-in'], ['approval.decided', undefined]]);
  });

  it('answers 404 for unknown ids, 400 for bad bodies, 415 without JSON, and 409 once decided', async () => {
    expect((await decide(open, 'fake:nope', { decision: 'approve' })).status).toBe(409);
    expect((await decide(open, 'nobody:ap-1', { decision: 'approve' })).status).toBe(404);
    expect((await decide(open, 'fake:ap-1', { decision: 'sure' })).status).toBe(400);
    const plain = await fetch(`${open.base}/api/approvals/fake%3Aap-1`, { method: 'POST', headers: { 'content-type': 'text/plain', origin: DEV }, body: 'approve' });
    expect(plain.status).toBe(415);
    expect((await decide(open, 'fake:ap-1', { decision: 'reject' })).status).toBe(200);
    expect((await decide(open, 'fake:ap-1', { decision: 'reject' })).status).toBe(409);
    expect(open.calls).toEqual(['ap-1:false']);
  });
});
