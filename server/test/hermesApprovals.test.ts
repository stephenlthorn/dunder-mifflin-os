// Which Hermes cards wait on you, how they read in the inbox, and the exact `hermes kanban` commands each button runs.
// Commands are only ever run here through a fake runner: never against a real board.
import { describe, expect, it } from 'vitest';
import type { KanbanWaiting } from '../src/hermes/types.ts';
import { decisionCommands, hermesApprovals, parseHermesApprovalId } from '../src/domain/hermesApprovals.ts';
import { DIRTY_TEXT } from './adapters/contractSuite.ts';
import { LEAK_PATTERNS } from './helpers/leakScan.ts';

const T0 = 1_800_000_000;
const card = (over: Partial<KanbanWaiting> & { id: string }): KanbanWaiting => ({
  title: 'A card', status: 'blocked', assignee: 'campaigns', createdBy: 'chief', blockKind: 'needs_input', event: 'blocked',
  reason: null, since: T0, comment: null, ...over,
});

describe('hermesApprovals (cards -> approvals)', () => {
  it('turns a bot blocked on your input into a question you can unblock or archive', () => {
    const [a] = hermesApprovals([card({ id: 't_ask', title: 'Send the client list?', reason: 'Load anyway?', comment: 'Waiting on you.' })]);
    expect(a).toEqual({
      id: 't_ask.blocked', agentId: 'campaigns', kind: 'question', title: 'Send the client list?', detail: 'Load anyway?',
      requestedAt: new Date(T0 * 1000).toISOString(), risk: 'medium', decidable: true,
      actions: { approve: 'Unblock it (your note goes on the card)', reject: 'Archive the card' },
    });
  });

  it('reads a capability block as a permission, a generic block as a task, and falls back to the latest comment for why', () => {
    const [cap, generic] = hermesApprovals([
      card({ id: 't_cap', blockKind: 'capability', reason: 'Needs the CRM login' }),
      card({ id: 't_gen', blockKind: null, reason: null, comment: 'Stuck on the API' }),
    ]);
    expect(cap).toMatchObject({ kind: 'permission', risk: 'high', detail: 'Needs the CRM login' });
    expect(generic).toMatchObject({ kind: 'task', risk: 'medium', detail: 'Stuck on the API' });
  });

  it('treats a card assigned to a person (not a bot) as your to-do, asked by whoever made it', () => {
    const [a] = hermesApprovals([card({ id: 't_mine', assignee: 'jan', createdBy: 'party-planner', blockKind: null })]);
    expect(a).toMatchObject({ agentId: 'party-planner', kind: 'task', risk: 'low', actions: { approve: 'Mark it done', reject: 'Archive the card' } });
  });

  it('lists review cards only when no bot reviews them (Hermes dispatches a bot assignee to review its own card)', () => {
    const list = hermesApprovals([
      card({ id: 't_human', status: 'review', assignee: null, createdBy: 'tech', event: 'review_requested', reason: 'Hero copy rewritten' }),
      card({ id: 't_bot', status: 'review', assignee: 'tech', event: 'review_requested' }),
    ]);
    expect(list).toEqual([expect.objectContaining({
      id: 't_human.review', agentId: 'tech', kind: 'task', risk: 'low', detail: 'Hero copy rewritten',
      actions: { approve: 'Accept it and mark it done', reject: 'Send it back with your note' },
    })]);
  });

  it('shows a card stuck in an unblock loop (triage) without buttons, and skips plain triage and dependency waits', () => {
    const list = hermesApprovals([
      card({ id: 't_loop', status: 'triage', event: 'block_loop_detected', reason: 'deploy keeps timing out', assignee: 'tech' }),
      card({ id: 't_idea', status: 'triage', event: null }),
      card({ id: 't_dep', blockKind: 'dependency' }),
    ]);
    expect(list).toEqual([expect.objectContaining({ id: 't_loop.triage', agentId: 'tech', decidable: false, title: 'A card' })]);
    expect(list[0]?.actions).toBeUndefined();
  });

  it('never lets a secret or home path out, and never trusts odd ids', () => {
    const list = hermesApprovals([card({ id: 't_x', title: DIRTY_TEXT, reason: DIRTY_TEXT }), card({ id: '--rm', title: 'Sneaky' }), card({ id: 't_who', assignee: 'Not A Profile!', createdBy: null })]);
    expect(LEAK_PATTERNS.filter(([, re]) => re.test(JSON.stringify(list))).map(([k]) => k)).toEqual([]);
    expect(list.map((a) => a.id)).toEqual(['t_x.blocked', 't_who.blocked']);
    expect(list[1]?.agentId).toBe('kanban');
  });
});

describe('decisionCommands (the CLI each button runs)', () => {
  const ask = card({ id: 't_ask' });
  it('unblocks with your note, or comments and archives', () => {
    expect(decisionCommands(ask, { approve: true })).toEqual([['kanban', 'unblock', 't_ask', '--reason=Approved in Dunder Mifflin OS']]);
    expect(decisionCommands(ask, { approve: true, note: '-go ahead' })).toEqual([['kanban', 'unblock', 't_ask', '--reason=Approved in Dunder Mifflin OS: -go ahead']]);
    expect(decisionCommands(ask, { approve: false, note: 'not now' })).toEqual([
      ['kanban', 'comment', 't_ask', 'Rejected in Dunder Mifflin OS: not now'], ['kanban', 'archive', 't_ask'],
    ]);
  });

  it('marks your own to-do done, or archives it', () => {
    const mine = card({ id: 't_mine', assignee: 'jan', blockKind: null });
    expect(decisionCommands(mine, { approve: true, note: 'published' })).toEqual([['kanban', 'complete', 't_mine', '--result=Done in Dunder Mifflin OS: published']]);
    expect(decisionCommands(mine, { approve: false })).toEqual([['kanban', 'comment', 't_mine', 'Rejected in Dunder Mifflin OS'], ['kanban', 'archive', 't_mine']]);
  });

  it('accepts a review by completing it, or sends it back with the note', () => {
    const rev = card({ id: 't_rev', status: 'review', assignee: null, event: 'review_requested' });
    expect(decisionCommands(rev, { approve: true })).toEqual([['kanban', 'complete', 't_rev', '--result=Accepted in Dunder Mifflin OS']]);
    expect(decisionCommands(rev, { approve: false, note: 'tighten the hero' })).toEqual([['kanban', 'reopen-review', 't_rev', '--reason=Changes requested in Dunder Mifflin OS: tighten the hero']]);
  });

  it('has nothing to run for a card that is only shown', () => {
    expect(decisionCommands(card({ id: 't_loop', status: 'triage', event: 'block_loop_detected' }), { approve: true })).toBeNull();
  });
});

describe('parseHermesApprovalId', () => {
  it('splits a card id and the state it was in, and refuses anything else', () => {
    expect(parseHermesApprovalId('t_ef5dfef5.blocked')).toEqual({ taskId: 't_ef5dfef5', status: 'blocked' });
    expect(parseHermesApprovalId('t_1.review')).toEqual({ taskId: 't_1', status: 'review' });
    for (const bad of ['t_1', 't_1.done', '-x.blocked', 't 1.blocked', '']) expect(parseHermesApprovalId(bad), bad).toBeNull();
  });
});
