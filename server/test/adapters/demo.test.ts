import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoAdapter, type DemoAdapter } from '../../src/adapters/demo/adapter.ts';
import { demoSeatRules } from '../../src/adapters/demo/seats.ts';
import { hm } from '../../../shared/demo/time.ts';
import { DEMO_CAST } from '../../../shared/demo/cast.ts';
import { buildOffice, defaultOfficeSetup } from '../../src/office/office.ts';
import { mergeSeatRules } from '../../src/office/seating.ts';
import { describeAdapterContract } from './contractSuite.ts';

const T0 = Date.parse('2026-10-13T15:00:00.000Z');
const opened: DemoAdapter[] = [];

function demo(start: string, opts: { speed?: 1 | 10 | 60; seed?: number } = {}) {
  let t = T0;
  const adapter = createDemoAdapter({ start: hm(start), speed: opts.speed ?? 60, seed: opts.seed ?? 1, now: () => t, replyDelayMs: 0 });
  opened.push(adapter);
  return { adapter, advance: (ms: number) => { t += ms; } };
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((a) => a.close?.()));
  vi.useRealTimers();
});

describeAdapterContract('demo', {
  make: async () => {
    const { adapter, advance } = demo('10:40');
    return {
      adapter,
      feedMore: async () => {
        advance(30_000);
        await adapter.createTask!({ roomId: 'demo-ops', title: 'Order more paper', assigneeAgentId: 'imports' });
      },
    };
  },
});

describe('demo adapter: the scripted day', () => {
  it('seats every demo bot at its character', () => {
    expect(demoSeatRules('demo')).toMatchObject({ pam: { adapter: 'demo', agent: 'frontdesk' }, kevin: { adapter: 'demo', agent: 'imports' } });
    expect(Object.keys(demoSeatRules('tlm'))).toHaveLength(DEMO_CAST.length);
  });

  it('shows the Council meeting with prefixed rooms and tasks', async () => {
    const snap = await demo('10:45').adapter.snapshot();
    expect(snap.presence.manager).toMatchObject({ status: 'meeting', roomId: 'demo-council', activity: 'Council: Q4 pricing review' });
    expect(snap.tasks).toContainEqual(expect.objectContaining({ id: 'demo-pricing', status: 'doing', ownerAgentId: 'manager', roomId: 'demo-council', shared: true }));
    expect(snap.rooms.find((r) => r.id === 'demo-council')).toMatchObject({ areaId: 'conference', memberAgentIds: ['manager', 'accounts', 'analyst', 'strategy', 'frontdesk'] });
    expect(snap.rooms.find((r) => r.id === 'demo-dm-sales')).toMatchObject({ kind: 'dm', memberAgentIds: ['sales'] });
    expect(snap.jobs?.it?.[0]).toMatchObject({ name: 'Fleet health check' });
  });

  it('reports a few cards nobody owns, which the office lists in Creed\'s corner', async () => {
    const adapter = demo('11:05').adapter;
    const snap = await adapter.snapshot();
    const reading = { adapter: { id: adapter.id, kind: adapter.kind, label: adapter.label, capabilities: adapter.capabilities }, snapshot: snap };
    const office = buildOffice([reading], defaultOfficeSetup(mergeSeatRules(demoSeatRules('demo'), {})), T0 / 1000);
    const cards = office.unattributed.filter((i) => i.kind === 'card');
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(cards.every((c) => c.agentId === undefined && c.detail.startsWith('Nobody owns'))).toBe(true);
    expect(office.snapshot.people).toHaveLength(23); // strays never take a desk
  });

  it('keeps a timeline from the script: the window counts back from office time, unknown agents get null', async () => {
    const adapter = demo('12:30').adapter;
    const lastDay = new Date(T0 - 86_400_000).toISOString(); // "the last 24 hours" in real time
    const events = await adapter.timeline!('sales', { since: lastDay, limit: 500 });
    expect(events?.map((e) => e.kind)).toEqual(expect.arrayContaining(['task.blocked', 'task.finished', 'cron.ok', 'message.out']));
    expect(events?.every((e) => e.at.startsWith('2005-03-24T'))).toBe(true);
    const later = demo('12:35').adapter;
    expect(await later.timeline!('sales', { since: new Date(T0 - 60_000).toISOString(), limit: 500 })).toHaveLength(0); // a quiet office minute
    expect((await adapter.timeline!('sales', { since: lastDay, limit: 3 }))?.length).toBe(3);
    expect(await adapter.timeline!('nobody', { since: lastDay, limit: 10 })).toBeNull();
  });

  it('runs on a clock: a minute of real time at 60x is an hour of office time, and the day loops', async () => {
    const { adapter, advance } = demo('10:50');
    expect((await adapter.snapshot()).presence.imports?.status).toBe('working');
    advance(3000);
    expect((await adapter.snapshot()).presence.imports).toMatchObject({ status: 'error', activity: expect.stringMatching(/chili/) });
    advance(60_000 * 7); // past 17:30: back to the morning
    expect(adapter.demo.clock()).toMatchObject({ day: 1, time: expect.stringMatching(/T08:/) });
  });

  it('changes speed on request, refusing anything but 1x, 10x or 60x', async () => {
    const { adapter, advance } = demo('09:00');
    expect(adapter.demo.setSpeed(5)).toMatchObject({ ok: false, status: 400 });
    expect(adapter.demo.setSpeed('1')).toMatchObject({ ok: true, value: { speed: 1 } });
    advance(60_000);
    expect(adapter.demo.clock().time).toBe('2005-03-24T09:01:00.000Z');
  });

  it('tells subscribers when the next scripted change happens', async () => {
    vi.useFakeTimers({ now: T0 });
    const adapter = createDemoAdapter({ start: hm('10:29'), speed: 60, seed: 1, replyDelayMs: 0 });
    opened.push(adapter);
    const listener = vi.fn();
    const off = adapter.subscribe!(listener);
    await vi.advanceTimersByTimeAsync(500);
    expect(listener).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(700); // 10:30: the Council starts
    expect(listener).toHaveBeenCalledTimes(1);
    expect((await adapter.snapshot()).presence.manager?.status).toBe('meeting');
    off();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('demo adapter: talking to the bots', () => {
  it('answers in character and keeps your message in the room history', async () => {
    const { adapter } = demo('09:40');
    const reply = await adapter.chat!('demo-dm-sales', 'Status on the leads?');
    expect(reply).toMatchObject({ ok: true, value: [{ authorAgentId: 'sales', roomId: 'demo-dm-sales' }] });
    const page = await adapter.readMessages('demo-dm-sales', 50);
    const mine = page!.messages.filter((m) => m.authorAgentId === undefined);
    expect(mine.map((m) => m.text)).toEqual(['Status on the leads?']);
    expect(page!.messages.at(-1)?.authorAgentId).toBe('sales');
  });

  it('routes room chat to the room lead, and refuses unknown rooms and bad text', async () => {
    const { adapter } = demo('09:40');
    expect(await adapter.chat!('demo-council', 'Agenda?')).toMatchObject({ ok: true, value: [{ authorAgentId: 'manager' }] });
    expect(await adapter.chat!('ops', 'hi')).toMatchObject({ ok: false, status: 404 });
    expect(await adapter.chat!('demo-ops', '   ')).toMatchObject({ ok: false, status: 400 });
  });

  it('keeps chat memory bounded', async () => {
    const { adapter } = demo('09:40');
    for (let i = 0; i < 60; i += 1) await adapter.chat!('demo-dm-it', `ping ${i}`);
    const page = await adapter.readMessages('demo-dm-it', 500);
    expect(page!.messages.length).toBeLessThanOrEqual(80);
    expect(page!.messages.some((m) => m.text === 'ping 59')).toBe(true);
  });

  it('creates shared tasks in memory: the bot walks to the Conference Room, works it, and is done', async () => {
    const { adapter, advance } = demo('09:40');
    const created = await adapter.createTask!({ roomId: 'demo-ops', title: 'Count the paper clips', assigneeAgentId: 'assistant' });
    expect(created).toMatchObject({ ok: true, value: { status: 'todo', ownerAgentId: 'assistant', roomId: 'demo-ops', shared: true } });
    const id = created.ok ? created.value.id : '';
    const status = async () => (await adapter.snapshot()).tasks.find((t) => t.id === id)?.status;
    expect(await status()).toBe('todo');
    advance(11_000); // 11 office minutes
    expect(await status()).toBe('doing');
    expect((await adapter.snapshot()).presence.assistant).toMatchObject({ status: 'meeting', roomId: 'demo-ops', activity: 'Count the paper clips' });
    advance(30_000);
    expect(await status()).toBe('done');
    expect((await adapter.snapshot()).presence.assistant?.status).not.toBe('meeting');
  });

  it('validates new tasks and forgets them when the day loops', async () => {
    const { adapter, advance } = demo('17:00');
    expect(await adapter.createTask!({ roomId: 'demo-council', title: 'x', assigneeAgentId: 'sales' })).toMatchObject({ ok: false, status: 400 });
    expect(await adapter.createTask!({ roomId: 'demo-ops', title: 'x', assigneeAgentId: 'jim' })).toMatchObject({ ok: false, status: 400 });
    expect(await adapter.createTask!({ roomId: 'demo-ops', title: '', assigneeAgentId: 'sales' })).toMatchObject({ ok: false, status: 400 });
    expect(await adapter.createTask!({ roomId: 'demo-ops', title: 'Tidy up', assigneeAgentId: 'sales' })).toMatchObject({ ok: true });
    advance(40_000); // past 17:30
    expect((await adapter.snapshot()).tasks.some((t) => t.title === 'Tidy up')).toBe(false);
  });
});
