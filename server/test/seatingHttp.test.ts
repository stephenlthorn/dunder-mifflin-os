// The HTTP API with a configured seating: Hermes `campaigns` moved from Dwight's desk to Jim's.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp, type App } from '../src/http/app.ts';
import { createHermesAdapter } from '../src/adapters/hermes.ts';
import { createFixtureSource, loadFixture } from '../src/hermes/fixtureSource.ts';
import { defaultOfficeSetup } from '../src/office/office.ts';
import { mergeSeatRules } from '../src/office/seating.ts';
import { DEFAULT_SEATS } from '../src/roster.ts';
import type { Runner } from '../src/chat/runner.ts';
import type { OfficeSnapshot } from '../../shared/contract.ts';

const fixture = loadFixture();
const T = Date.parse(fixture.state.recordedAt) / 1000;
const home = mkdtempSync(path.join(tmpdir(), 'dmos-seating-'));
const headshots = path.join(home, 'headshots');
mkdirSync(headshots, { recursive: true });
writeFileSync(path.join(headshots, 'campaigns.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9]));
const runner: Runner = async (_file, args) => (args[0] === 'kanban'
  ? { stdout: JSON.stringify({ id: 't_new2', status: 'todo', created_at: T }), stderr: '', code: 0, timedOut: false }
  : { stdout: 'Question.\n', stderr: '', code: 0, timedOut: false });

let app: App;
let base: string;
beforeAll(async () => {
  app = createApp({
    adapters: [createHermesAdapter({ source: createFixtureSource({ fixture }), runner, hermesBin: '/fake/hermes', now: () => T })],
    setup: defaultOfficeSetup(mergeSeatRules(DEFAULT_SEATS, { jim: { adapter: 'hermes', agent: 'campaigns' } })),
    hermesHome: home, headshotDir: headshots, pollIntervalMs: 60_000, now: () => T, allowWrites: true, // exercises chat and tasks
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await app.close();
  rmSync(home, { recursive: true, force: true });
});

const post = (p: string, body: unknown) =>
  fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('a configured seating', () => {
  it('draws the bot at its new desk and leaves the old one without a bot', async () => {
    const snap = await (await fetch(`${base}/api/office`)).json() as OfficeSnapshot;
    const jim = snap.people.find((p) => p.id === 'jim');
    expect(jim).toMatchObject({ name: 'Dwight Schrute', bot: { profile: 'campaigns', adapter: 'hermes' } });
    expect(snap.people.find((p) => p.id === 'dwight')?.bot).toBeUndefined();
    expect(snap.presence.dwight).toEqual({ status: 'no-bot' });
    expect(snap.rooms.find((r) => r.id === 'dm-campaigns')).toMatchObject({ memberIds: ['jim'], areaId: 'bullpen' });
    expect(snap.tasks.find((t) => t.title === 'Restock the conference room paper')?.ownerId).toBe('jim');
  });

  it('answers chat as the new character and takes the new character as an assignee', async () => {
    expect(await (await post('/api/chat', { roomId: 'dm-campaigns', text: 'hi' })).json()).toEqual([expect.objectContaining({ authorId: 'jim' })]);
    const created = await post('/api/tasks', { roomId: 'ops', title: 'Sell paper', assignee: 'jim' });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ id: 't_new2', ownerId: 'jim' });
    expect((await post('/api/tasks', { roomId: 'ops', title: 'Sell paper', assignee: 'dwight' })).status).toBe(400);
  });

  it('falls back to the bot\'s headshot for its new character only', async () => {
    expect((await fetch(`${base}/api/portraits/jim`)).status).toBe(200);
    expect((await fetch(`${base}/api/portraits/dwight`)).status).toBe(404);
  });
});
