// Control verbs, office side: writes on + the adapter's flag (and the agent's own) + arguments checked against a fresh
// snapshot + an audit entry written BEFORE the adapter acts (no audit log, no action). Fake adapters only.
import { describe, expect, it } from 'vitest';
import type { AgentCapabilities } from '../../../shared/contract.ts';
import type { AgentAdapter, ControlResult } from '../../src/adapters/types.ts';
import { NO_CAPABILITIES } from '../../src/adapters/types.ts';
import type { AuditEntry, AuditLog } from '../../src/audit/auditLog.ts';
import { createOfficeService } from '../../src/office/service.ts';
import { defaultOfficeSetup } from '../../src/office/office.ts';
import { mergeSeatRules } from '../../src/office/seating.ts';
import { READ_ONLY_ERROR } from '../../src/office/writes.ts';

const NOW = 1_800_000_000;
const AT = new Date(NOW * 1000).toISOString();
const ALL: AgentCapabilities = { chat: false, createTask: false, approvals: false, pause: true, stop: true, runJob: true, reassign: true };

type Log = { entries: AuditEntry[]; calls: string[] };

function fakeAdapter(log: Log, opts: { id?: string; caps?: AgentCapabilities; narrow?: Partial<AgentCapabilities>; fail?: boolean } = {}): AgentAdapter {
  const id = opts.id ?? 'fake';
  const act = (what: string) => async (): Promise<ControlResult> => {
    log.calls.push(`${what} (audited: ${log.entries.map((e) => e.event).join(',')})`);
    return opts.fail ? { ok: false, status: 502, error: 'The agent said no' } : { ok: true, value: null };
  };
  const caps = opts.caps ?? ALL;
  const adapter: AgentAdapter = {
    id, kind: 'webhook', label: id === 'fake' ? 'Fake' : 'Other', capabilities: caps,
    snapshot: async () => ({
      agents: [{ id: 'a1', role: 'Seller' }, { id: 'a2', role: 'Buyer' }],
      presence: { a1: { status: 'working' }, a2: { status: 'idle' } },
      tasks: [
        { id: 'card-run', title: 'Call Lackawanna County', status: 'doing', ownerAgentId: 'a1', shared: false, updatedAt: AT },
        { id: 'card-todo', title: 'Fax the order', status: 'todo', ownerAgentId: 'a1', shared: false, updatedAt: AT },
        { id: 'card-done', title: 'Old sale', status: 'done', ownerAgentId: 'a1', shared: false, updatedAt: AT },
        { id: 'card-a2', title: 'Not yours', status: 'todo', ownerAgentId: 'a2', shared: false, updatedAt: AT },
      ],
      rooms: [],
      jobs: { a1: [
        { id: 'job-on', name: 'Morning sales report', schedule: '0 9 * * *', enabled: true },
        { id: 'job-off', name: 'Weekend report', schedule: '0 9 * * 6', enabled: false },
      ] },
      ...(opts.narrow ? { capabilities: { a1: opts.narrow } } : {}),
    }),
    readMessages: async () => null,
  };
  const methods = {
    pause: act('pause:a1'), resume: act('resume:a1'),
    stop: async (agentId: string, target?: { taskId?: string }) => act(`stop:${agentId}:${target?.taskId ?? '-'}`)(),
    runJob: async (agentId: string, jobId: string) => act(`run-job:${agentId}:${jobId}`)(),
    reassign: async (agentId: string, taskId: string, to: string) => act(`reassign:${agentId}:${taskId}->${to}`)(),
  };
  return {
    ...adapter,
    ...(caps.pause ? { pause: methods.pause, resume: methods.resume } : {}),
    ...(caps.stop ? { stop: methods.stop } : {}),
    ...(caps.runJob ? { runJob: methods.runJob } : {}),
    ...(caps.reassign ? { reassign: methods.reassign } : {}),
  };
}

function auditInto(log: Log, works = true): AuditLog {
  return { file: 'memory', append: (entry) => (works ? (log.entries.push(entry), true) : false) };
}

function setup(opts: { allowWrites?: boolean; audit?: 'ok' | 'broken' | 'none'; caps?: AgentCapabilities; narrow?: Partial<AgentCapabilities>; fail?: boolean } = {}) {
  const log: Log = { entries: [], calls: [] };
  const other = fakeAdapter(log, { id: 'other' });
  const seats = mergeSeatRules({}, { dwight: { adapter: 'fake', agent: 'a1' }, jim: { adapter: 'fake', agent: 'a2' }, kevin: { adapter: 'other', agent: 'a1' } });
  const audit = opts.audit === 'none' ? null : auditInto(log, opts.audit !== 'broken');
  const office = createOfficeService({
    adapters: [fakeAdapter(log, { caps: opts.caps, narrow: opts.narrow, fail: opts.fail }), other],
    setup: defaultOfficeSetup(seats), now: () => NOW, allowWrites: opts.allowWrites ?? true, audit,
  });
  return { office, log };
}

describe('control verbs through the office', () => {
  it('are refused on a read-only server without auditing or calling the adapter', async () => {
    const { office, log } = setup({ allowWrites: false });
    expect(await office.act('dwight', { action: 'pause' }, 'local')).toEqual({ ok: false, status: 403, error: READ_ONLY_ERROR });
    expect(log).toEqual({ entries: [], calls: [] });
  });

  it('are refused when the adapter does not declare the verb (501), and when this agent turned it off', async () => {
    const none = setup({ caps: NO_CAPABILITIES });
    expect(await none.office.act('dwight', { action: 'pause' }, 'local')).toEqual({ ok: false, status: 501, error: "Fake agents can't be paused" });
    expect(await none.office.act('dwight', { action: 'run-job', args: { jobId: 'job-on' } }, 'local'))
      .toEqual({ ok: false, status: 501, error: "Fake agents can't run jobs from the office" });
    expect(await none.office.act('dwight', { action: 'reassign', args: { taskId: 'card-todo', to: 'jim' } }, 'local'))
      .toEqual({ ok: false, status: 501, error: "Fake agents can't hand cards over" });
    const narrowed = setup({ narrow: { pause: false } });
    expect(await narrowed.office.act('dwight', { action: 'resume' }, 'local'))
      .toEqual({ ok: false, status: 501, error: 'This agent gave the office no way to pause it' });
    expect(none.log.calls).toEqual([]);
    expect(narrowed.log.calls).toEqual([]);
  });

  it('validate the body and the desk', async () => {
    const { office, log } = setup();
    expect(await office.act('dwight', { action: 'terminate' }, 'local')).toMatchObject({ ok: false, status: 400 });
    expect(await office.act('pam', { action: 'pause' }, 'local')).toEqual({ ok: false, status: 404, error: 'No agent at that desk' });
    expect(log.calls).toEqual([]);
  });

  it('write the audit entry first, then act, then record the outcome', async () => {
    const { office, log } = setup();
    expect(await office.act('dwight', { action: 'pause' }, 'signed-in')).toEqual({ ok: true, value: { ok: true, action: 'pause', message: 'Paused Dwight Schrute.' } });
    expect(log.calls).toEqual(['pause:a1 (audited: control.request)']);
    expect(log.entries).toEqual([
      { event: 'control.request', action: 'pause', person: 'dwight', adapter: 'fake', agent: 'a1', actor: 'signed-in' },
      { event: 'control.done', action: 'pause', person: 'dwight' },
    ]);
  });

  it('record a failure the adapter reports, and pass its status on', async () => {
    const { office, log } = setup({ fail: true });
    expect(await office.act('dwight', { action: 'stop' }, 'local')).toEqual({ ok: false, status: 502, error: 'The agent said no' });
    expect(log.entries.at(-1)).toEqual({ event: 'control.failed', action: 'stop', person: 'dwight', status: 502, error: 'The agent said no' });
  });

  it('do nothing when the audit log cannot be written (fail closed) or there is none', async () => {
    for (const audit of ['broken', 'none'] as const) {
      const { office, log } = setup({ audit });
      expect(await office.act('dwight', { action: 'pause' }, 'local')).toMatchObject({ ok: false, status: 503, error: expect.stringMatching(/audit log/) });
      expect(log.calls).toEqual([]);
    }
  });

  it('run a job only when it is one of this desk\'s jobs and switched on', async () => {
    const { office, log } = setup();
    expect(await office.act('dwight', { action: 'run-job', args: { jobId: 'nope' } }, 'local')).toEqual({ ok: false, status: 404, error: 'No such job at this desk' });
    expect(await office.act('jim', { action: 'run-job', args: { jobId: 'job-on' } }, 'local')).toEqual({ ok: false, status: 404, error: 'No such job at this desk' });
    expect(await office.act('dwight', { action: 'run-job', args: { jobId: 'job-off' } }, 'local'))
      .toEqual({ ok: false, status: 409, error: 'That job is paused where it runs; resume it there first' });
    const ran = await office.act('dwight', { action: 'run-job', args: { jobId: 'job-on' } }, 'local');
    expect(ran).toEqual({ ok: true, value: { ok: true, action: 'run-job', message: 'Morning sales report: running now.' } });
    expect(log.calls).toEqual(['run-job:a1:job-on (audited: control.request)']);
    expect(log.entries[0]).toMatchObject({ event: 'control.request', action: 'run-job', job: 'job-on', jobName: 'Morning sales report' });
  });

  it('hand over only this desk\'s open cards, to another bot of the same adapter', async () => {
    const { office, log } = setup();
    const to = (taskId: string, who: string) => office.act('dwight', { action: 'reassign', args: { taskId, to: who } }, 'local');
    expect(await to('card-a2', 'jim')).toEqual({ ok: false, status: 404, error: 'No such card on this desk' });
    expect(await to('card-done', 'jim')).toEqual({ ok: false, status: 409, error: 'That card is done' });
    expect(await to('card-todo', 'dwight')).toEqual({ ok: false, status: 400, error: 'Pick someone else' });
    expect(await to('card-todo', 'kevin')).toEqual({ ok: false, status: 400, error: 'Hand it to another Fake agent' });
    expect(await to('card-todo', 'pam')).toEqual({ ok: false, status: 400, error: 'Hand it to another Fake agent' });
    expect(await to('card-todo', 'jim')).toEqual({ ok: true, value: { ok: true, action: 'reassign', message: 'Fax the order: now with Jim Halpert.' } });
    expect(log.calls).toEqual(['reassign:a1:card-todo->a2 (audited: control.request)']);
    expect(log.entries[0]).toMatchObject({ task: 'card-todo', taskTitle: 'Fax the order', to: 'jim', toAgent: 'a2' });
  });

  it('stop a named card only while it runs', async () => {
    const { office, log } = setup();
    expect(await office.act('dwight', { action: 'stop', args: { taskId: 'card-todo' } }, 'local')).toEqual({ ok: false, status: 409, error: 'That card is not running' });
    expect(await office.act('dwight', { action: 'stop', args: { taskId: 'card-run' } }, 'local')).toMatchObject({ ok: true });
    expect(await office.act('dwight', { action: 'stop' }, 'local')).toMatchObject({ ok: true, value: { message: 'Stopped Dwight Schrute\'s current run.' } });
    expect(log.calls).toEqual(['stop:a1:card-run (audited: control.request)', 'stop:a1:- (audited: control.request,control.done,control.request)']);
  });

  it('let Corporate (the budget monitor) pause a bot, audited as corporate', async () => {
    const { office, log } = setup();
    expect(await office.act('dwight', { action: 'pause' }, 'corporate', 'Over its monthly budget')).toMatchObject({ ok: true });
    expect(log.entries[0]).toEqual({ event: 'control.request', action: 'pause', person: 'dwight', adapter: 'fake', agent: 'a1', actor: 'corporate', reason: 'Over its monthly budget' });
  });
});
