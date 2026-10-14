import { describe, expect, it } from 'vitest';
import { redactState } from '../scripts/redact.ts';
import type { HermesState } from '../src/hermes/types.ts';

const T = 1_800_000_000;
const STATE: HermesState = {
  recordedAt: new Date(T * 1000).toISOString(),
  gateway: { running: true, platforms: [{ profile: 'tech', state: 'connected', errorCode: null, updatedAt: null }] },
  telegram: [
    { profile: 'tech', enabled: true, groupChats: ['c_aaa', 'c_internal'], leadChats: ['c_aaa'], roomHints: { c_aaa: 'Ops' } },
  ],
  chatNames: { c_aaa: 'Vance Refrigeration Ops', c_internal: '[INTERNAL] Prince Family Paper' },
  kanban: {
    tasks: [
      { id: 't_real1', title: 'Email Bob at Acme about the invoice', assignee: 'tech', status: 'running', createdBy: 'toby-audit', tenant: 'sales', createdAt: T - 100, startedAt: T - 50, completedAt: null, lastHeartbeatAt: T - 5 },
      { id: 't_real2', title: 'Council 2026-10-12: secret plan', assignee: 'stamford', status: 'done', createdBy: 'council', tenant: 'council', createdAt: T - 900, startedAt: null, completedAt: T - 800, lastHeartbeatAt: null },
    ],
    runs: [
      { taskId: 't_real1', profile: 'tech', status: 'running', outcome: null, startedAt: T - 50, endedAt: null, lastHeartbeatAt: T - 5 },
      { taskId: 't_gone', profile: 'tech', status: 'crashed', outcome: 'crashed', startedAt: T - 50, endedAt: T - 10, lastHeartbeatAt: null },
    ],
    subs: [{ taskId: 't_real1', chatKey: 'c_aaa', chatType: 'group', notifierProfile: 'tech' }],
    links: [{ parentId: 't_real1', childId: 't_real2', parentAssignee: 'tech', childAssignee: 'stamford' }],
  },
  sessions: [{ profile: 'tech', lastActivityAt: T - 30, title: 'Fix Jane Doe\'s laptop', source: 'telegram' }],
  cron: [{ profile: 'tech', id: 'a1b2c3d4e5f6', name: 'Sabre AM Printer Report', enabled: true, schedule: '0 9 * * *', nextRunAt: null, lastRunAt: null, lastStatus: 'ok' }],
  personas: { tech: 'Sadiq', stamford: 'Karen Filippelli' },
};

describe('redactState (fixture recording)', () => {
  const { state } = redactState(STATE);
  const json = JSON.stringify(state);

  it('replaces chat keys with room-named keys and scrubs group titles', () => {
    expect(state.telegram[0]?.groupChats).toEqual(['chat-ops', 'chat-x1']);
    expect(state.telegram[0]?.roomHints).toEqual({ 'chat-ops': 'Ops' });
    expect(state.chatNames).toEqual({ 'chat-ops': 'Dunder Mifflin Ops' });
    expect(state.kanban.subs[0]?.chatKey).toBe('chat-ops');
  });

  it('replaces task ids and titles, session titles and cron ids/names', () => {
    for (const leak of ['t_real1', 'Acme', 'Bob', 'secret plan', 'Jane', 'Sabre', 'a1b2c3d4e5f6', 'toby-audit', '"sales"', 'Vance', 'Prince Family']) {
      expect(json).not.toContain(leak);
    }
    expect(state.kanban.tasks.map((t) => t.id)).toEqual(['t_fx001', 't_fx002']);
    expect(state.kanban.tasks[1]).toMatchObject({ createdBy: 'council', assignee: null, tenant: null });
  });

  it('keeps structure: runs/links remapped, orphans dropped, timestamps and statuses intact', () => {
    expect(state.kanban.runs).toEqual([{ taskId: 't_fx001', profile: 'tech', status: 'running', outcome: null, startedAt: T - 50, endedAt: null, lastHeartbeatAt: T - 5 }]);
    expect(state.kanban.links).toEqual([{ parentId: 't_fx001', childId: 't_fx002', parentAssignee: 'tech', childAssignee: null }]);
    expect(state.sessions[0]).toMatchObject({ lastActivityAt: T - 30, source: 'telegram' });
    expect(state.personas).toEqual({ tech: 'Sadiq' });
  });
});
