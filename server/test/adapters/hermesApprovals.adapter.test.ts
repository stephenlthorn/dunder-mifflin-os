// The Hermes adapter's approvals inbox end to end, on the recorded fixture plus waiting cards, with a FAKE runner:
// a decision re-reads the board, refuses a card that has moved on, and runs exactly the planned hermes commands.
import { describe, expect, it } from 'vitest';
import { createHermesAdapter } from '../../src/adapters/hermes.ts';
import type { Runner } from '../../src/chat/runner.ts';
import { createFixtureSource, loadFixture, type Fixture } from '../../src/hermes/fixtureSource.ts';
import type { KanbanWaiting } from '../../src/hermes/types.ts';

const base = loadFixture();
const T = Date.parse(base.state.recordedAt) / 1000;
const WAITING: KanbanWaiting[] = [
  { id: 't_ask', title: 'Send the client list?', status: 'blocked', assignee: 'campaigns', createdBy: 'chief', blockKind: 'needs_input', event: 'blocked', reason: 'Load anyway?', since: T - 600, comment: null },
  { id: 't_loop', title: 'Flaky deploy', status: 'triage', assignee: 'tech', createdBy: 'tech', blockKind: 'transient', event: 'block_loop_detected', reason: 'timeouts', since: T - 300, comment: null },
];

function setup(opts: { waiting?: KanbanWaiting[]; code?: number; timedOut?: boolean } = {}) {
  let waiting = opts.waiting ?? WAITING;
  const fixture = (): Fixture => ({ ...base, state: { ...base.state, kanban: { ...base.state.kanban, waiting } } });
  const calls: string[][] = [];
  const runner: Runner = async (file, args) => {
    calls.push([file, ...args]);
    return { stdout: '', stderr: 'boom', code: opts.code ?? 0, timedOut: opts.timedOut ?? false };
  };
  const source = { kind: 'fixture' as const, readState: async () => (await createFixtureSource({ fixture: fixture() }).readState()), readMessages: async () => ({ ok: false as const, reason: 'none' }) };
  const adapter = createHermesAdapter({ source, runner, hermesBin: '/fake/hermes', now: () => T, cacheTtlMs: 60_000 });
  return { adapter, calls, move: (next: KanbanWaiting[]) => { waiting = next; } };
}

describe('Hermes approvals', () => {
  it('declares the capability and lists what waits on you from the board', async () => {
    const { adapter } = setup();
    expect(adapter.capabilities.approvals).toBe(true);
    const listed = await adapter.listApprovals!();
    expect(listed.map((a) => [a.id, a.agentId, a.decidable])).toEqual([['t_ask.blocked', 'campaigns', true], ['t_loop.triage', 'tech', false]]);
    expect((await adapter.snapshot()).approvals).toEqual(listed);
  });

  it('runs exactly the planned command for a decision', async () => {
    const { adapter, calls } = setup();
    expect(await adapter.resolveApproval!('t_ask.blocked', { approve: true, note: 'go' })).toEqual({ ok: true, value: null });
    expect(calls).toEqual([['/fake/hermes', 'kanban', 'unblock', 't_ask', '--reason=Approved in Dunder Mifflin OS: go']]);
  });

  it('re-reads the board and refuses a card that has moved on (the cache is not trusted)', async () => {
    const { adapter, calls, move } = setup();
    await adapter.listApprovals!();
    move([{ ...WAITING[0]!, status: 'review', event: 'review_requested', assignee: null }]);
    expect(await adapter.resolveApproval!('t_ask.blocked', { approve: true })).toMatchObject({ ok: false, status: 409 });
    expect(calls).toEqual([]);
  });

  it('refuses shown-only cards and malformed ids without running anything', async () => {
    const { adapter, calls } = setup();
    expect(await adapter.resolveApproval!('t_loop.triage', { approve: true })).toMatchObject({ ok: false, status: 409 });
    expect(await adapter.resolveApproval!('--rm.blocked', { approve: true })).toMatchObject({ ok: false, status: 404 });
    expect(calls).toEqual([]);
  });

  it('reports a failing or slow hermes CLI and stops at the first failed step', async () => {
    const failing = setup({ code: 2 });
    expect(await failing.adapter.resolveApproval!('t_ask.blocked', { approve: false })).toEqual({ ok: false, status: 502, error: 'hermes kanban comment failed' });
    expect(failing.calls).toHaveLength(1);
    const slow = setup({ timedOut: true, code: -1 });
    expect(await slow.adapter.resolveApproval!('t_ask.blocked', { approve: true })).toMatchObject({ ok: false, status: 504 });
  });
});
