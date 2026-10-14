import { describe, expect, it } from 'vitest';
import { createAgentStore } from '../../src/adapters/ingest/store.ts';
import type { IngestEvent } from '../../src/adapters/ingest/schema.ts';

const T0 = Date.parse('2026-10-13T15:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

function setup(over: Partial<Parameters<typeof createAgentStore>[0]> = {}) {
  let t = T0;
  const store = createAgentStore({ adapterId: 'webhook', defaultRole: 'Webhook agent', now: () => t, ...over });
  return { store, advance: (ms: number) => { t += ms; }, at: () => t };
}
const ev = (e: Partial<IngestEvent> & { type: IngestEvent['type'] }, at = T0): IngestEvent => ({ at, ...e } as IngestEvent);

describe('agent store (in-memory state behind the webhook and claude-code adapters)', () => {
  it('creates an agent on its first event, with a direct line', () => {
    const { store } = setup();
    expect(store.apply('deploy-bot', ev({ type: 'status', status: 'working', activity: 'Migrating', name: 'Deploy Bot', role: 'Ships releases' }))).toEqual({ ok: true });
    const snap = store.snapshot();
    expect(snap.agents).toEqual([{ id: 'deploy-bot', name: 'Deploy Bot', role: 'Ships releases' }]);
    expect(snap.presence['deploy-bot']).toEqual({ status: 'working', activity: 'Migrating', since: iso(T0) });
    expect(snap.rooms).toEqual([{ id: 'webhook-deploy-bot', name: 'Direct line', kind: 'dm', memberAgentIds: ['deploy-bot'] }]);
  });

  it('keeps `since` while the status stays the same, and moves it when the status changes', () => {
    const { store } = setup();
    store.apply('a', ev({ type: 'status', status: 'working', activity: 'one' }, T0));
    store.apply('a', ev({ type: 'status', status: 'working', activity: 'two' }, T0 + 1000));
    expect(store.snapshot().presence.a).toEqual({ status: 'working', activity: 'two', since: iso(T0) });
    store.apply('a', ev({ type: 'status', status: 'idle' }, T0 + 2000));
    expect(store.snapshot().presence.a).toEqual({ status: 'idle', since: iso(T0 + 2000) });
  });

  it('marks an agent working on an activity event, and puts a meeting in its room', () => {
    const { store } = setup();
    store.apply('a', ev({ type: 'activity', text: 'Opened PR 42' }));
    expect(store.snapshot().presence.a).toMatchObject({ status: 'working', activity: 'Opened PR 42' });
    expect(store.snapshot().agents[0]).toEqual({ id: 'a', role: 'Webhook agent' });
    store.apply('a', ev({ type: 'status', status: 'meeting', room: 'ops' }));
    expect(store.snapshot().presence.a).toMatchObject({ status: 'meeting', roomId: 'ops' });
  });

  it('upserts tasks by id, newest first, and drops done tasks after two days', () => {
    const { store, advance, at } = setup({ forgetAfterMs: 7 * 24 * 3600_000 });
    store.apply('a', ev({ type: 'task', id: '42', title: 'Deploy', status: 'todo' }));
    store.apply('a', ev({ type: 'task', id: '42', title: 'Deploy v1.2', status: 'done', shared: true, room: 'ops' }, T0 + 1000));
    store.apply('a', ev({ type: 'task', id: '43', title: 'Rollback plan', status: 'doing' }, T0 + 2000));
    expect(store.snapshot().tasks).toEqual([
      { id: 'webhook:a:43', title: 'Rollback plan', status: 'doing', ownerAgentId: 'a', shared: false, updatedAt: iso(T0 + 2000) },
      { id: 'webhook:a:42', title: 'Deploy v1.2', status: 'done', ownerAgentId: 'a', roomId: 'ops', shared: true, updatedAt: iso(T0 + 1000) },
    ]);
    advance(49 * 3600_000);
    store.apply('a', ev({ type: 'activity', text: 'still here' }, at()));
    expect(store.snapshot().tasks.map((t) => t.id)).toEqual(['webhook:a:43']);
  });

  it('keeps messages in a ring buffer for the direct line', () => {
    const { store } = setup({ messagesPerAgent: 3 });
    for (let i = 1; i <= 5; i += 1) store.apply('a', ev({ type: 'message', text: `m${i}` }, T0 + i));
    const page = store.readMessages('webhook-a', 10);
    expect(page?.messages.map((m) => m.text)).toEqual(['m3', 'm4', 'm5']);
    expect(page?.messages[0]).toEqual({ id: 'webhook-a-3', roomId: 'webhook-a', authorAgentId: 'a', text: 'm3', at: iso(T0 + 3) });
    expect(store.readMessages('webhook-a', 1)?.messages.map((m) => m.text)).toEqual(['m5']);
    expect(store.readMessages('webhook-b', 10)).toBeNull();
    expect(store.readMessages('ops', 10)).toBeNull();
  });

  it('scrubs every piece of free text it keeps', () => {
    const { store } = setup();
    const dirty = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123 /Users/jane/x +1 570 555 0123';
    store.apply('a', ev({ type: 'status', status: 'error', activity: dirty, name: `Bot ${dirty}`, role: dirty }));
    store.apply('a', ev({ type: 'task', id: '1', title: dirty, status: 'todo' }));
    store.apply('a', ev({ type: 'message', text: dirty }));
    const json = JSON.stringify([store.snapshot(), store.readMessages('webhook-a', 10)]);
    expect(json).not.toMatch(/sk-ant|\/Users\/|570 555/);
  });

  it('lets a busy agent go idle when it falls silent, and forgets it after a day', () => {
    const { store, advance } = setup({ staleAfterMs: 60_000, forgetAfterMs: 3600_000 });
    store.apply('a', ev({ type: 'status', status: 'working', activity: 'Crunching' }));
    store.apply('b', ev({ type: 'status', status: 'needs-input', activity: 'Approve?' }));
    advance(61_000);
    expect(store.snapshot().presence.a).toEqual({ status: 'idle', since: iso(T0) });
    expect(store.snapshot().presence.b?.status).toBe('needs-input'); // still waiting on you
    advance(3600_000);
    expect(store.snapshot().agents).toEqual([]);
  });

  it('retires an agent after a grace period', () => {
    const { store, advance } = setup();
    store.apply('a', ev({ type: 'status', status: 'offline', activity: 'Session ended' }));
    store.retire('a', 1000);
    expect(store.has('a')).toBe(true);
    advance(1001);
    expect(store.has('a')).toBe(false);
    expect(store.snapshot().agents).toEqual([]);
  });

  it('revives a retired agent that sends another event before its grace period ends', () => {
    const { store, advance } = setup();
    store.apply('a', ev({ type: 'status', status: 'offline' }));
    store.retire('a', 1000);
    store.apply('a', ev({ type: 'activity', text: 'back again' }));
    advance(5000);
    expect(store.has('a')).toBe(true);
  });

  it('caps how many agents it tracks', () => {
    const { store } = setup({ maxAgents: 2 });
    expect(store.apply('a', ev({ type: 'activity', text: 'x' })).ok).toBe(true);
    expect(store.apply('b', ev({ type: 'activity', text: 'x' })).ok).toBe(true);
    expect(store.apply('c', ev({ type: 'activity', text: 'x' }))).toMatchObject({ ok: false, status: 429 });
    expect(store.apply('a', ev({ type: 'activity', text: 'y' })).ok).toBe(true);
  });

  it('notifies subscribers and hands out snapshots that never change', () => {
    const { store } = setup();
    let calls = 0;
    const off = store.subscribe(() => { calls += 1; });
    store.apply('a', ev({ type: 'activity', text: 'one' }));
    const before = store.snapshot();
    const frozen = JSON.stringify(before);
    store.apply('a', ev({ type: 'activity', text: 'two' }));
    expect(JSON.stringify(before)).toBe(frozen);
    expect(calls).toBe(2);
    off();
    store.apply('a', ev({ type: 'activity', text: 'three' }));
    expect(calls).toBe(2);
  });
});
