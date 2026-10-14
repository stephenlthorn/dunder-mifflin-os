// Writes through adapters (approvals: approvalActions.test.ts) need BOTH the server to allow writes (DMOS_ALLOW_WRITES) AND the adapter's capability flag.
import { describe, expect, it } from 'vitest';
import type { AgentCapabilities } from '../../shared/contract.ts';
import type { AgentAdapter } from '../src/adapters/types.ts';
import { NO_CAPABILITIES } from '../src/adapters/types.ts';
import { createOfficeService } from '../src/office/service.ts';
import { defaultOfficeSetup } from '../src/office/office.ts';
import { mergeSeatRules } from '../src/office/seating.ts';
import { READ_ONLY_ERROR } from '../src/office/writes.ts';

const NOW = 1_800_000_000;
const AT = new Date(NOW * 1000).toISOString();
const ALL: AgentCapabilities = { chat: true, createTask: true, approvals: true, pause: true, stop: true };

function fakeAdapter(id: string, agentId: string, full: boolean) {
  const calls: string[] = [];
  const ok = async (what: string) => { calls.push(what); return { ok: true as const, value: null }; };
  const base: AgentAdapter = {
    id, kind: 'webhook', label: id === 'fake' ? 'Fake' : 'Limited', capabilities: full ? ALL : NO_CAPABILITIES,
    snapshot: async () => ({
      agents: [{ id: agentId, role: 'Test agent' }], presence: { [agentId]: { status: 'idle' } }, tasks: [],
      rooms: [{ id: `${id}-${agentId}`, name: 'Direct line', kind: 'dm', memberAgentIds: [agentId] }],
    }),
    readMessages: async () => ({ messages: [] }),
  };
  if (!full) return { adapter: base, calls };
  const adapter: AgentAdapter = {
    ...base,
    chat: async (roomId, text) => { calls.push(`chat:${text}`); return { ok: true, value: [{ id: 'm1', roomId, authorAgentId: agentId, text: 'Done.', at: AT }] }; },
    createTask: async (input) => {
      calls.push(`task:${String(input.assigneeAgentId)}`);
      return { ok: true, value: { id: 'fake:1', title: String(input.title), status: 'todo', ownerAgentId: agentId, shared: false, updatedAt: AT } };
    },
    listApprovals: async () => [{ id: 'ap-1', agentId, kind: 'permission', title: 'Run the deploy?', requestedAt: AT }],
    resolveApproval: (approvalId, d) => ok(`approval:${approvalId}:${d.approve}`),
    pause: (a) => ok(`pause:${a}`), resume: (a) => ok(`resume:${a}`), stop: (a) => ok(`stop:${a}`),
  };
  return { adapter, calls };
}

function service(allowWrites: boolean) {
  const fake = fakeAdapter('fake', 'a1', true);
  const limited = fakeAdapter('limited', 'b1', false);
  const setup = defaultOfficeSetup(mergeSeatRules({}, { jim: { adapter: 'fake', agent: 'a1' }, kevin: { adapter: 'limited', agent: 'b1' } }));
  const audit = { file: 'memory', append: () => true }; // control verbs are refused without an audit log (controls tests)
  return { office: createOfficeService({ adapters: [fake.adapter, limited.adapter], setup, now: () => NOW, allowWrites, audit }), fake, limited };
}

describe('writes through adapters', () => {
  it('are all refused on a read-only server, without calling the adapter', async () => {
    const { office, fake } = service(false);
    const readOnly = { ok: false, status: 403, error: READ_ONLY_ERROR };
    expect(await office.chat('fake-a1', 'hi')).toEqual(readOnly);
    expect(await office.createTask({ roomId: 'fake-a1', title: 'x', assignee: 'jim' })).toEqual(readOnly);
    for (const action of ['pause', 'resume', 'stop'] as const) expect(await office.act('jim', { action }, 'local')).toEqual(readOnly);
    expect(fake.calls).toEqual([]);
  });

  it('are refused for an adapter that does not declare the capability, even with writes on', async () => {
    const { office } = service(true);
    expect(await office.chat('limited-b1', 'hi')).toMatchObject({ ok: false, status: 501, error: "Limited agents can't receive messages" });
    expect(await office.createTask({ roomId: 'limited-b1', title: 'x', assignee: 'kevin' })).toMatchObject({ ok: false, status: 501 });
    expect(await office.act('kevin', { action: 'pause' }, 'local')).toMatchObject({ ok: false, status: 501, error: "Limited agents can't be paused" });
    expect(await office.act('kevin', { action: 'stop' }, 'local')).toMatchObject({ ok: false, status: 501, error: "Limited agents can't be stopped" });
  });

  it('go through when both allow, with people turned into agent ids and back', async () => {
    const { office, fake } = service(true);
    expect(await office.chat('fake-a1', 'hi')).toEqual({ ok: true, value: [{ id: 'm1', roomId: 'fake-a1', authorId: 'jim', text: 'Done.', at: AT }] });
    expect(await office.createTask({ roomId: 'fake-a1', title: 'Ship', assignee: 'jim' })).toMatchObject({ ok: true, value: { ownerId: 'jim' } });
    expect(await office.act('jim', { action: 'pause' }, 'local')).toMatchObject({ ok: true });
    expect(await office.act('jim', { action: 'stop' }, 'local')).toMatchObject({ ok: true });
    expect(fake.calls).toEqual(['chat:hi', 'task:a1', 'pause:a1', 'stop:a1']);
    expect(await office.act('pam', { action: 'pause' }, 'local')).toMatchObject({ ok: false, status: 404 });
  });
});
