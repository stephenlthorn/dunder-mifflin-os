// Deciding an approval: writes on + the adapter's approvals flag, a valid decision, an item that is still pending and
// decidable, and an audit entry written BEFORE the adapter acts (no audit log = nothing happens).
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AgentCapabilities } from '../../shared/contract.ts';
import type { AgentAdapter, ApprovalRequest } from '../src/adapters/types.ts';
import { NO_CAPABILITIES } from '../src/adapters/types.ts';
import { createAuditLog, type AuditLog } from '../src/audit/auditLog.ts';
import { parseDecision } from '../src/office/decision.ts';
import { createOfficeService } from '../src/office/service.ts';
import { defaultOfficeSetup } from '../src/office/office.ts';
import { mergeSeatRules } from '../src/office/seating.ts';
import { READ_ONLY_ERROR } from '../src/office/writes.ts';

const NOW = 1_800_000_000;
const AT = new Date(NOW * 1000).toISOString();
const ALL: AgentCapabilities = { chat: false, createTask: false, approvals: true, pause: false, stop: false };
const root = mkdtempSync(path.join(tmpdir(), 'dmos-approvals-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const PENDING: ReadonlyArray<ApprovalRequest> = [
  { id: 'ap-1', agentId: 'a1', kind: 'permission', title: 'Run the deploy?', requestedAt: AT, risk: 'high' },
  { id: 'ap-2', agentId: 'a1', kind: 'question', title: 'Shown only', requestedAt: AT, decidable: false },
];

function fake(id: string, caps: AgentCapabilities, result: { ok: true; value: null } | { ok: false; status: 502; error: string } = { ok: true, value: null }) {
  const calls: string[] = [];
  const adapter: AgentAdapter = {
    id, kind: 'webhook', label: id === 'fake' ? 'Fake' : 'Limited', capabilities: caps,
    snapshot: async () => ({ agents: [{ id: 'a1', role: 'Test agent' }], presence: { a1: { status: 'idle' } }, tasks: [], rooms: [], approvals: PENDING }),
    readMessages: async () => null,
    ...(caps.approvals ? {
      listApprovals: async () => PENDING,
      resolveApproval: async (approvalId: string, d: { approve: boolean; note?: string }) => { calls.push(`${approvalId}:${d.approve}:${d.note ?? ''}`); return result; },
    } : {}),
  };
  return { adapter, calls };
}

function office(opts: { allowWrites: boolean; audit?: AuditLog | null; adapter?: ReturnType<typeof fake> }) {
  const main = opts.adapter ?? fake('fake', ALL);
  const limited = fake('limited', NO_CAPABILITIES);
  const setup = defaultOfficeSetup(mergeSeatRules({}, { jim: { adapter: 'fake', agent: 'a1' } }));
  const audit = opts.audit === undefined ? createAuditLog({ file: path.join(root, `${Math.random()}.log`) }) : opts.audit;
  const service = createOfficeService({ adapters: [main.adapter, limited.adapter], setup, now: () => NOW, allowWrites: opts.allowWrites, audit });
  return { service, calls: main.calls, audit };
}

const lines = (audit: AuditLog | null | undefined) => readFileSync(audit!.file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);

describe('parseDecision', () => {
  it('takes approve or reject and an optional one-paragraph note', () => {
    expect(parseDecision({ decision: 'approve' })).toEqual({ ok: true, value: { approve: true } });
    expect(parseDecision({ decision: 'reject', note: '  not on a Friday \n please ' })).toEqual({ ok: true, value: { approve: false, note: 'not on a Friday \n please' } });
    expect(parseDecision({ decision: 'reject', note: '   ' })).toEqual({ ok: true, value: { approve: false } });
  });

  it('refuses anything else', () => {
    for (const body of [null, {}, { decision: 'yes' }, { decision: true }, { decision: 'approve', note: 5 }, { decision: 'approve', note: 'x'.repeat(501) },
      { decision: 'approve', note: 'bell\u0007' }]) {
      expect(parseDecision(body).ok, JSON.stringify(body)).toBe(false);
    }
  });
});

describe('approvals through the office', () => {
  it('lists pending items as people, also on a read-only server', async () => {
    const { service } = office({ allowWrites: false });
    expect((await service.approvals()).map((a) => [a.id, a.personId, a.decidable])).toEqual([['fake:ap-1', 'jim', true], ['fake:ap-2', 'jim', false]]);
  });

  it('refuses every decision on a read-only server without auditing or calling the adapter', async () => {
    const { service, calls, audit } = office({ allowWrites: false });
    expect(await service.resolveApproval('fake:ap-1', { decision: 'approve' }, 'local')).toEqual({ ok: false, status: 403, error: READ_ONLY_ERROR });
    expect(calls).toEqual([]);
    expect(() => readFileSync(audit!.file)).toThrow();
  });

  it('refuses adapters without the approvals flag, unknown ids, bad bodies and items that are only shown', async () => {
    const { service, calls } = office({ allowWrites: true });
    expect(await service.resolveApproval('limited:ap-1', { decision: 'approve' }, 'local')).toMatchObject({ status: 501 });
    expect(await service.resolveApproval('nope:ap-1', { decision: 'approve' }, 'local')).toMatchObject({ status: 404 });
    expect(await service.resolveApproval('fake:ap-9', { decision: 'approve' }, 'local')).toMatchObject({ status: 409, error: expect.stringMatching(/no longer/i) });
    expect(await service.resolveApproval('garbage', { decision: 'approve' }, 'local')).toMatchObject({ status: 404 });
    expect(await service.resolveApproval('fake:ap-1', { decision: 'maybe' }, 'local')).toMatchObject({ status: 400 });
    expect(await service.resolveApproval('fake:ap-2', { decision: 'approve' }, 'local')).toMatchObject({ status: 409, error: expect.stringMatching(/where the agent runs/i) });
    expect(calls).toEqual([]);
  });

  it('audits, then decides, then audits the outcome (no secrets in the log)', async () => {
    const { service, calls, audit } = office({ allowWrites: true });
    expect(await service.resolveApproval('fake:ap-1', { decision: 'reject', note: 'not with sk-ant-api03-abcdefghijklmnopqrstuvwxyz' }, 'signed-in')).toEqual({ ok: true });
    expect(calls).toEqual(['ap-1:false:not with sk-ant-api03-abcdefghijklmnopqrstuvwxyz']);
    const [intent, outcome] = lines(audit);
    expect(intent).toMatchObject({ event: 'approval.decide', approval: 'fake:ap-1', adapter: 'fake', agent: 'a1', person: 'jim', kind: 'permission', risk: 'high',
      title: 'Run the deploy?', decision: 'reject', note: 'not with [secret]', actor: 'signed-in' });
    expect(outcome).toMatchObject({ event: 'approval.decided', approval: 'fake:ap-1', decision: 'reject' });
  });

  it('passes an adapter failure through and audits it', async () => {
    const failing = fake('fake', ALL, { ok: false, status: 502, error: 'hermes kanban failed' });
    const { service, audit } = office({ allowWrites: true, adapter: failing });
    expect(await service.resolveApproval('fake:ap-1', { decision: 'approve' }, 'local')).toEqual({ ok: false, status: 502, error: 'hermes kanban failed' });
    expect(lines(audit).map((l) => l.event)).toEqual(['approval.decide', 'approval.failed']);
  });

  it('does nothing when the audit log cannot be written (fail closed) or there is none', async () => {
    for (const audit of [createAuditLog({ file: root }), null]) {
      const { service, calls } = office({ allowWrites: true, audit });
      expect(await service.resolveApproval('fake:ap-1', { decision: 'approve' }, 'local')).toMatchObject({ ok: false, status: 503 });
      expect(calls).toEqual([]);
    }
  });
});
