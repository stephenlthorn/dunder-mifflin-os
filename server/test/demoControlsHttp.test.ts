// The demo day's control verbs and Corporate over HTTP, as `--demo` runs them: verbs reach only the in-memory demo
// bots and are audited in memory, and the demo's budgets come from its scripted usage (alerts only: no auto-pause).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { BudgetsReport, ControlReply } from '../../shared/controls.ts';
import type { OfficeSnapshot } from '../../shared/contract.ts';
import { hm } from '../../shared/demo/time.ts';
import { createDemoAdapter } from '../src/adapters/demo/adapter.ts';
import { DEMO_BUDGETS } from '../src/adapters/demo/usage.ts';
import { createMemoryAudit } from '../src/audit/memoryAudit.ts';
import { seatDefaults } from '../src/demoMode.ts';
import { createApp, type App } from '../src/http/app.ts';
import { defaultOfficeSetup } from '../src/office/office.ts';
import { mergeSeatRules } from '../src/office/seating.ts';

const audit = createMemoryAudit();
let app: App;
let base: string;
beforeAll(async () => {
  app = createApp({
    adapters: [createDemoAdapter({ start: hm('16:45'), speed: 1, replyDelayMs: 0 })],
    setup: defaultOfficeSetup(mergeSeatRules(seatDefaults([{ kind: 'demo', id: 'demo' }]), {})),
    hermesHome: '/nonexistent', headshotDir: null, portraitsDir: null, pollIntervalMs: 60_000, allowWrites: true,
    auditFile: null, audit, budgets: DEMO_BUDGETS, budgetCheckMs: 0,
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterAll(() => app.close());

const act = (personId: string, body: unknown) =>
  fetch(`${base}/api/people/${personId}/actions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('the demo day takes control verbs', () => {
  it('offers stop, run-job and reassign on demo bots, never pause', async () => {
    const snap = await (await fetch(`${base}/api/office`)).json() as OfficeSnapshot;
    expect(snap.people.find((p) => p.id === 'sadiq')?.bot?.capabilities).toMatchObject({ pause: false, stop: true, runJob: true, reassign: true });
    expect(snap.jobs?.sadiq?.[0]).toMatchObject({ id: 'job-it-0', name: 'Fleet health check' });
    expect((await act('sadiq', { action: 'pause' })).status).toBe(501);
  });

  it('runs a job now, audited in memory', async () => {
    const res = await act('sadiq', { action: 'run-job', args: { jobId: 'job-it-0' } });
    expect(res.status).toBe(200);
    expect(await res.json() as ControlReply).toMatchObject({ action: 'run-job', message: 'Fleet health check: running now.' });
    const snap = await (await fetch(`${base}/api/office`)).json() as OfficeSnapshot;
    expect(snap.jobs?.sadiq?.[0]).toMatchObject({ lastStatus: 'running' });
    expect(audit.entries().map((e) => [e.event, e.action, e.person])).toEqual([['control.request', 'run-job', 'sadiq'], ['control.done', 'run-job', 'sadiq']]);
  });

  it('shows Corporate\'s demo budgets: Kelly over her daily budget, Kevin on a model nobody can price', async () => {
    const report = await (await fetch(`${base}/api/budgets`)).json() as BudgetsReport;
    expect(report.autoPause).toBe(false);
    expect(report.budgets.find((b) => b.personId === 'kelly')).toMatchObject({ level: 'over', action: 'alert', note: 'Auto-pause is off (budgets.autoPause in config.yaml)' });
    expect(report.budgets.find((b) => b.personId === 'kevin')).toMatchObject({ level: 'unpriced', lines: [expect.objectContaining({ unpricedModels: ['chili-7b-local'] })] });
    expect(report.budgets.map((b) => b.personId).sort()).toEqual(['dwight', 'kelly', 'kevin', 'michael']);
  });
});
