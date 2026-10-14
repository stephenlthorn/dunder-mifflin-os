// The demo day over HTTP: the office, the clock and its speed control, chat and new tasks, and nothing real.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp, type App } from '../src/http/app.ts';
import { createDemoAdapter } from '../src/adapters/demo/adapter.ts';
import { defaultOfficeSetup } from '../src/office/office.ts';
import { mergeSeatRules } from '../src/office/seating.ts';
import { seatDefaults } from '../src/demoMode.ts';
import { hm } from '../../shared/demo/time.ts';
import type { OfficeSnapshot } from '../../shared/contract.ts';

const photos = mkdtempSync(path.join(tmpdir(), 'dmos-demo-photos-'));
mkdirSync(path.join(photos, 'portraits'));
writeFileSync(path.join(photos, 'portraits', 'pam.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]));
afterAll(() => rmSync(photos, { recursive: true, force: true }));

async function start(allowWrites: boolean): Promise<{ app: App; base: string }> {
  const app = createApp({
    adapters: [createDemoAdapter({ start: hm('10:45'), speed: 60, replyDelayMs: 0 })],
    setup: defaultOfficeSetup(mergeSeatRules(seatDefaults([{ kind: 'demo', id: 'demo' }]), {})),
    hermesHome: '/nonexistent', headshotDir: null, portraitsDir: null, pollIntervalMs: 60_000, allowWrites,
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  return { app, base: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}` };
}

const post = (base: string, url: string, body: unknown) =>
  fetch(`${base}${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('the demo day over HTTP', () => {
  let app: App;
  let base: string;
  beforeAll(async () => ({ app, base } = await start(true)));
  afterAll(() => app.close());

  it('serves the office with the demo cast at their desks and the rest without bots', async () => {
    const snap = await (await fetch(`${base}/api/office`)).json() as OfficeSnapshot;
    expect(snap.adapters).toEqual([expect.objectContaining({ id: 'demo', kind: 'demo', label: 'Demo', agents: 13 })]);
    expect(snap.people.find((p) => p.id === 'dwight')).toMatchObject({ name: 'Dwight Schrute', bot: { profile: 'sales', adapter: 'demo' } });
    expect(snap.presence.jim).toEqual({ status: 'no-bot' });
    expect(snap.presence.michael).toMatchObject({ status: 'meeting', roomId: 'demo-council' });
    expect(snap.rooms.filter((r) => r.areaId === 'conference').map((r) => r.id).sort()).toEqual(['demo-council', 'demo-ops']);
  });

  it('answers the clock, and changes its speed', async () => {
    const clock = await (await fetch(`${base}/api/demo/clock`)).json();
    expect(clock).toMatchObject({ title: 'Threat Level Midnight', speed: 60, speeds: [1, 10, 60] });
    const res = await post(base, '/api/demo/clock', { speed: 10 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ speed: 10 });
    expect((await post(base, '/api/demo/clock', { speed: 2 })).status).toBe(400);
    expect((await post(base, '/api/demo/clock', [])).status).toBe(400);
  });

  it('chats with canned replies and creates shared tasks in memory', async () => {
    const chat = await post(base, '/api/chat', { roomId: 'demo-dm-imports', text: 'How is the import?' });
    expect(chat.status).toBe(200);
    expect(await chat.json()).toEqual([expect.objectContaining({ authorId: 'kevin', roomId: 'demo-dm-imports' })]);
    const history = await (await fetch(`${base}/api/rooms/demo-dm-imports/messages`)).json() as Array<{ authorId: string; text: string }>;
    expect(history.some((m) => m.authorId === 'you' && m.text === 'How is the import?')).toBe(true);
    const task = await post(base, '/api/tasks', { roomId: 'demo-ops', title: 'Restock the paper', assignee: 'kelly' });
    expect(task.status).toBe(201);
    expect(await task.json()).toMatchObject({ title: 'Restock the paper', ownerId: 'kelly', roomId: 'demo-ops', status: 'todo' });
  });

  it('never serves photos or headshots, even when files exist', async () => {
    expect((await fetch(`${base}/api/portraits/pam`)).status).toBe(404);
    expect((await fetch(`${base}/api/headshots/chief`)).status).toBe(404);
  });
});

describe('the demo clock on a read-only server', () => {
  let app: App;
  let base: string;
  beforeAll(async () => ({ app, base } = await start(false)));
  afterAll(() => app.close());

  it('can be read but not changed', async () => {
    expect((await fetch(`${base}/api/demo/clock`)).status).toBe(200);
    expect((await post(base, '/api/demo/clock', { speed: 10 })).status).toBe(403);
  });
});

describe('without a demo adapter', () => {
  it('has no demo clock', async () => {
    const app = createApp({ adapters: [], hermesHome: '/nonexistent', headshotDir: '/nonexistent', pollIntervalMs: 60_000 });
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}/api/demo/clock`;
    expect((await fetch(url)).status).toBe(404);
    await app.close();
  });
});
