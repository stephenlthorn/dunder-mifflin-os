// A real Dunder Mifflin OS server (createApp: HTTP, sign-in/writes gates, control verbs, audit log, Corporate) in front
// of a MOCK adapter, for the browser e2e tests of control verbs (web/e2e/controlsServer.ts starts it). Nothing here
// talks to Hermes or any real agent. Prints one JSON line {port, dir} once listening; dir holds audit.log and
// calls.log (one line per verb the mock adapter received). Stops on SIGTERM.
//   tsx scripts/e2e-controls-server.ts --origin http://127.0.0.1:5180 [--auto-pause] [--read-only]
import { appendFileSync, mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Presence } from '../../shared/contract.ts';
import type { AgentAdapter, AgentTask, ControlResult } from '../src/adapters/types.ts';
import { createApp } from '../src/http/app.ts';
import { defaultOfficeSetup } from '../src/office/office.ts';
import { mergeSeatRules } from '../src/office/seating.ts';

const AT = '2026-10-13T15:00:00.000Z';
const args = process.argv.slice(2);
const origin = args[args.indexOf('--origin') + 1] ?? 'http://127.0.0.1:5180';
const dir = mkdtempSync(path.join(tmpdir(), 'dmos-e2e-controls-'));
const record = (what: string) => appendFileSync(path.join(dir, 'calls.log'), `${what}\n`);

function mockAdapter(): AgentAdapter {
  let presence: Record<string, Presence> = { seller: { status: 'working', activity: 'Calling Lackawanna County' }, buyer: { status: 'idle' } };
  let tasks: AgentTask[] = [
    { id: 'card-1', title: 'Call Lackawanna County', status: 'doing', ownerAgentId: 'seller', shared: false, updatedAt: AT },
    { id: 'card-2', title: 'Fax the paper order', status: 'todo', ownerAgentId: 'seller', shared: false, updatedAt: AT },
  ];
  const done = (what: string, after?: () => void): ControlResult => {
    record(what);
    after?.();
    return { ok: true, value: null };
  };
  const set = (id: string, p: Presence) => { presence = { ...presence, [id]: p }; };
  return {
    id: 'mock', kind: 'webhook', label: 'Mock',
    capabilities: { chat: false, createTask: false, approvals: false, pause: true, stop: true, runJob: true, reassign: true },
    snapshot: async () => ({
      agents: [{ id: 'seller', role: 'Sales' }, { id: 'buyer', role: 'Purchasing' }], presence, tasks, rooms: [],
      jobs: { seller: [{ id: 'job-report', name: 'Morning sales report', schedule: 'Weekdays 09:00', enabled: true }] },
    }),
    readMessages: async () => null,
    pause: async (agentId) => done(`pause:${agentId}`, () => set(agentId, { status: 'offline', activity: 'Paused from the office' })),
    resume: async (agentId) => done(`resume:${agentId}`, () => set(agentId, { status: 'idle' })),
    stop: async (agentId, target) => done(`stop:${agentId}:${target?.taskId ?? '-'}`),
    runJob: async (agentId, jobId) => done(`run-job:${agentId}:${jobId}`),
    reassign: async (agentId, taskId, to) => done(`reassign:${agentId}:${taskId}->${to}`, () => {
      tasks = tasks.map((t) => (t.id === taskId ? { ...t, ownerAgentId: to } : t));
    }),
    usage: async (agentId) => ({
      models: [{ model: 'mock-model', inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0,
        recordedCost: { amount: agentId === 'seller' ? 25 : 1.2, kind: 'actual' } }],
    }),
  };
}

const app = createApp({
  adapters: [mockAdapter()],
  setup: defaultOfficeSetup(mergeSeatRules({}, { dwight: { adapter: 'mock', agent: 'seller' }, jim: { adapter: 'mock', agent: 'buyer' } })),
  hermesHome: dir, headshotDir: dir, pollIntervalMs: 60_000, allowWrites: !args.includes('--read-only'), accessToken: null,
  auditFile: path.join(dir, 'audit.log'), allowedOrigins: new Set([origin]), budgetCheckMs: 0,
  budgets: { autoPause: args.includes('--auto-pause'), limits: { dwight: { monthly: 20 }, jim: { daily: 5, monthly: 40 } } },
});
app.server.listen(0, '127.0.0.1', () => {
  process.stdout.write(`${JSON.stringify({ port: (app.server.address() as AddressInfo).port, dir })}\n`);
});
process.on('SIGTERM', () => { app.close().then(() => process.exit(0), () => process.exit(1)); });
