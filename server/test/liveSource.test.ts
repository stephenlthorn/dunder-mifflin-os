import { afterAll, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { createLiveSource } from '../src/hermes/liveSource.ts';
import { createChatKeyer } from '../src/hermes/chatKey.ts';
import { buildSnapshot, roomChatsOf } from '../src/domain/snapshot.ts';
import { loadPeople } from '../src/people.ts';
import { COUNCIL_CHAT, DM_CHAT, OPS_CHAT, T0, makeFakeHermesHome } from './helpers/fakeHermesHome.ts';

const home = makeFakeHermesHome();
afterAll(() => rmSync(home, { recursive: true, force: true }));

const keyOf = createChatKeyer(Buffer.from('test'));
const source = createLiveSource({ hermesHome: home, statusUrl: null, keyOf, now: () => T0 });

describe('live adapter readState (fake HERMES_HOME)', async () => {
  const state = await source.readState();

  it('reads the gateway file and keeps telegram platforms', () => {
    expect(state.gateway?.running).toBe(true);
    expect(state.gateway?.platforms.map((p) => p.profile).sort()).toEqual(['campaigns', 'social', 'tech']);
  });

  it('reads telegram room config as opaque keys and resolves rooms', () => {
    const tech = state.telegram.find((t) => t.profile === 'tech');
    expect(tech?.groupChats).toEqual([keyOf(OPS_CHAT), keyOf(COUNCIL_CHAT)]);
    expect(roomChatsOf(state).map((rc) => rc.roomId)).toEqual(['ops', 'council']);
    expect(state.chatNames[keyOf(OPS_CHAT)]).toBe('Paper Ops');
  });

  it('reads kanban: open + recent cards, running + recently failed runs, subs, cross-assignee links', () => {
    expect(state.kanban.tasks.map((t) => t.id).sort()).toEqual(['t_crash', 't_run']);
    expect(state.kanban.runs.map((r) => `${r.taskId}:${r.status}`).sort()).toEqual(['t_crash:crashed', 't_run:running']);
    expect(state.kanban.subs).toEqual([{ taskId: 't_run', chatKey: keyOf(OPS_CHAT), chatType: 'group', notifierProfile: 'tech' }]);
    expect(state.kanban.links).toEqual([{ parentId: 't_parent', childId: 't_run', parentAssignee: 'tech', childAssignee: 'campaigns' }]);
  });

  it('reads the latest session per profile, cron jobs and personas', () => {
    expect(state.sessions).toEqual([{ profile: 'tech', lastActivityAt: T0 - 40, title: 'dmos-ops', source: 'cli' }]);
    expect(state.cron.map((j) => j.name)).toEqual(['ops-heartbeat']);
    expect(state.personas).toEqual({ tech: 'Sadiq', campaigns: 'Dwight Schrute' });
  });

  it('never carries chat ids, secrets, prompts or tool output', () => {
    const json = JSON.stringify(state);
    for (const leak of [OPS_CHAT.slice(1), COUNCIL_CHAT.slice(1), DM_CHAT, 'hunter2', 'SECRET', 'secret', 'PRIVATE', 'Traceback', home]) {
      expect(json).not.toContain(leak);
    }
  });

  it('feeds a sane snapshot', () => {
    const snap = buildSnapshot(state, loadPeople(), T0);
    expect(snap.presence.dwight).toMatchObject({ status: 'meeting', roomId: 'ops', activity: 'Shared ops card' });
    expect(snap.presence.kelly).toMatchObject({ status: 'error', activity: 'Task crashed: Crashy card' });
    expect(snap.presence.sadiq).toMatchObject({ status: 'working', activity: 'dmos-ops' });
    expect(snap.presence.pam).toMatchObject({ status: 'offline' });
  });
});

describe('live adapter readMessages', () => {
  it('reads a room\'s Telegram session and the OS thread, final texts only', async () => {
    const res = await source.readMessages({ profile: 'tech', target: { kind: 'group', chatKey: keyOf(OPS_CHAT) }, osSessionTitle: 'dmos-ops', limit: 50 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.messages.map((m) => [m.origin, m.role, m.text])).toEqual([
      ['telegram', 'user', '[Jan Levinson] How is the copier?'],
      ['telegram', 'assistant', 'Copier is fine.'],
      ['os', 'user', '[Ops room] From the OS'],
      ['os', 'assistant', 'OS reply'],
    ]);
    expect(res.messages[0]).toMatchObject({ uid: 'u_a', profile: 'tech', platformMessageId: '901', at: T0 - 300 });
  });

  it('reads the direct-line (DM) session', async () => {
    const res = await source.readMessages({ profile: 'tech', target: { kind: 'dm' }, osSessionTitle: 'dmos-dm-tech', limit: 50 });
    expect(res.ok && res.messages.map((m) => m.text)).toEqual(['dm hello']);
  });

  it('explains why there is nothing to read', async () => {
    expect(await source.readMessages({ profile: 'campaigns', target: { kind: 'dm' }, osSessionTitle: 'x', limit: 5 }))
      .toEqual({ ok: false, reason: 'no-state-db' });
    expect(await source.readMessages({ profile: '../tech', target: { kind: 'dm' }, osSessionTitle: 'x', limit: 5 }))
      .toEqual({ ok: false, reason: 'unknown-profile' });
  });
});
