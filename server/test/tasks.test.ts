import { describe, expect, it } from 'vitest';
import { annotateTasks, mapKanbanStatus, runsForProfile, toAgentTasks, OS_CREATOR_PREFIX } from '../src/domain/tasks.ts';
import type { KanbanState, KanbanTask, RoomChat } from '../src/hermes/types.ts';

const NOW = 1_800_000_000;
const task = (over: Partial<KanbanTask> & { id: string }): KanbanTask => ({
  title: `Task ${over.id}`, assignee: 'tech', status: 'todo', createdBy: 'user', tenant: null,
  createdAt: NOW - 3600, startedAt: null, completedAt: null, lastHeartbeatAt: null, ...over,
});
const ROOM_CHATS: RoomChat[] = [
  { roomId: 'ops', chatKey: 'c_ops', profiles: ['tech'] },
  { roomId: 'hq', chatKey: 'c_hq', profiles: ['chief'] },
];
const kanban = (over: Partial<KanbanState> = {}): KanbanState => ({ tasks: [], runs: [], subs: [], links: [], ...over });

describe('mapKanbanStatus', () => {
  it('folds the kanban columns into the contract statuses', () => {
    expect(['triage', 'todo', 'ready', 'scheduled'].map(mapKanbanStatus)).toEqual(['todo', 'todo', 'todo', 'todo']);
    expect(['running', 'review'].map(mapKanbanStatus)).toEqual(['doing', 'doing']);
    expect(mapKanbanStatus('blocked')).toBe('blocked');
    expect(mapKanbanStatus('done')).toBe('done');
    expect(mapKanbanStatus('archived')).toBeNull();
    expect(mapKanbanStatus('weird')).toBeNull();
  });
});

describe('annotateTasks (room + shared)', () => {
  it('puts a task in the room its notify subscription points at; ops/council make it shared', () => {
    const k = kanban({
      tasks: [task({ id: 't1' }), task({ id: 't2', assignee: 'chief' })],
      subs: [
        { taskId: 't1', chatKey: 'c_ops', chatType: 'group', notifierProfile: 'tech' },
        { taskId: 't2', chatKey: 'c_hq', chatType: 'group', notifierProfile: 'chief' },
      ],
    });
    const byId = Object.fromEntries(annotateTasks(k, ROOM_CHATS).map((t) => [t.task.id, t]));
    expect(byId.t1).toMatchObject({ roomId: 'ops', shared: true });
    expect(byId.t2).toMatchObject({ roomId: 'hq', shared: false });
  });

  it('maps a DM subscription to that bot\'s direct line', () => {
    const k = kanban({ tasks: [task({ id: 't1', assignee: 'social' })], subs: [{ taskId: 't1', chatKey: 'c_dm', chatType: 'dm', notifierProfile: 'social' }] });
    expect(annotateTasks(k, ROOM_CHATS)[0]).toMatchObject({ roomId: 'dm-social', shared: false });
  });

  it('treats council-created cards as Council room tasks', () => {
    const k = kanban({ tasks: [task({ id: 't1', assignee: 'cmo', createdBy: 'council' })] });
    expect(annotateTasks(k, ROOM_CHATS)[0]).toMatchObject({ roomId: 'council', shared: true });
  });

  it('recognises cards created from Dunder Mifflin OS by their created_by marker', () => {
    const k = kanban({ tasks: [task({ id: 't1', assignee: 'campaigns', createdBy: `${OS_CREATOR_PREFIX}ops` })] });
    expect(annotateTasks(k, ROOM_CHATS)[0]).toMatchObject({ roomId: 'ops', shared: true });
  });

  it('a task linked to another assignee\'s task is shared and meets in ops by default', () => {
    const k = kanban({
      tasks: [task({ id: 'p', assignee: 'tech' }), task({ id: 'c', assignee: 'social' }), task({ id: 'solo', assignee: 'tech' }), task({ id: 'same', assignee: 'tech' })],
      links: [
        { parentId: 'p', childId: 'c', parentAssignee: 'tech', childAssignee: 'social' },
        { parentId: 'solo', childId: 'same', parentAssignee: 'tech', childAssignee: 'tech' },
      ],
    });
    const byId = Object.fromEntries(annotateTasks(k, ROOM_CHATS).map((t) => [t.task.id, t]));
    expect(byId.p).toMatchObject({ shared: true, roomId: 'ops' });
    expect(byId.c).toMatchObject({ shared: true, roomId: 'ops' });
    expect(byId.solo).toMatchObject({ shared: false });
    expect(byId.solo?.roomId).toBeUndefined();
  });
});

describe('toAgentTasks', () => {
  it('keeps a bot assignee as the owner agent and drops archived and stale done cards', () => {
    const k = kanban({
      tasks: [
        task({ id: 'open', assignee: 'campaigns', status: 'running', startedAt: NOW - 60 }),
        task({ id: 'gone', status: 'archived' }),
        task({ id: 'old', status: 'done', createdAt: NOW - 4 * 86_400, completedAt: NOW - 3 * 86_400 }),
        task({ id: 'fresh', status: 'done', completedAt: NOW - 3600, assignee: 'jan' }),
      ],
    });
    const tasks = toAgentTasks(annotateTasks(k, ROOM_CHATS), NOW);
    expect(tasks.map((t) => t.id)).toEqual(['open', 'fresh']);
    expect(tasks[0]).toEqual({ id: 'open', title: 'Task open', status: 'doing', ownerAgentId: 'campaigns', shared: false, updatedAt: new Date((NOW - 60) * 1000).toISOString() });
    expect(tasks[1]?.ownerAgentId).toBeUndefined(); // 'jan' is a person, not a bot
  });

  it('caps the list', () => {
    const many = Array.from({ length: 300 }, (_, i) => task({ id: `t${i}`, createdAt: NOW - i }));
    expect(toAgentTasks(annotateTasks(kanban({ tasks: many }), ROOM_CHATS), NOW)).toHaveLength(200);
  });
});

describe('runsForProfile', () => {
  it('joins runs with their task title, room and shared flag', () => {
    const k = kanban({
      tasks: [task({ id: 't1', title: 'Council round', createdBy: 'council' })],
      runs: [
        { taskId: 't1', profile: 'cmo', status: 'running', outcome: null, startedAt: NOW - 10, endedAt: null, lastHeartbeatAt: null },
        { taskId: 'missing', profile: 'cmo', status: 'running', outcome: null, startedAt: NOW - 10, endedAt: null, lastHeartbeatAt: null },
        { taskId: 't1', profile: 'tech', status: 'running', outcome: null, startedAt: NOW - 10, endedAt: null, lastHeartbeatAt: null },
      ],
    });
    const runs = runsForProfile(annotateTasks(k, ROOM_CHATS), k.runs, 'cmo');
    expect(runs).toEqual([
      { title: 'Council round', status: 'running', outcome: null, startedAt: NOW - 10, endedAt: null, lastHeartbeatAt: null, shared: true, roomId: 'council' },
      { title: 'Kanban card', status: 'running', outcome: null, startedAt: NOW - 10, endedAt: null, lastHeartbeatAt: null, shared: false },
    ]);
  });
});
