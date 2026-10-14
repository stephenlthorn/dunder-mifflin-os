import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp, type App } from '../src/http/app.ts';
import { createHermesAdapter } from '../src/adapters/hermes.ts';
import { createFixtureSource, loadFixture } from '../src/hermes/fixtureSource.ts';
import type { Runner } from '../src/chat/runner.ts';

const fixture = loadFixture();
const T = Date.parse(fixture.state.recordedAt) / 1000;
const DEV = 'http://localhost:5173';
const home = mkdtempSync(path.join(tmpdir(), 'dmos-readonly-'));

let runs = 0;
const runner: Runner = async (_file, args) => {
  runs += 1;
  if (args[0] === 'kanban') return { stdout: JSON.stringify({ id: 't_new1', status: 'ready', created_at: T }), stderr: '', code: 0, timedOut: false };
  return { stdout: 'Bears. Beets. Battlestar Galactica.\n', stderr: '', code: 0, timedOut: false };
};

async function start(allowWrites?: boolean): Promise<{ app: App; base: string }> {
  const app = createApp({
    adapters: [createHermesAdapter({ source: createFixtureSource({ fixture }), runner, hermesBin: '/fake/hermes', now: () => T })],
    hermesHome: home, headshotDir: home, pollIntervalMs: 60_000, now: () => T, ...(allowWrites === undefined ? {} : { allowWrites }),
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  return { app, base: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}` };
}

type Snap = { capabilities?: unknown };
const post = (base: string, p: string, body: unknown) =>
  fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: DEV }, body: JSON.stringify(body) });

let readOnly: { app: App; base: string };
let writable: { app: App; base: string };
beforeAll(async () => {
  readOnly = await start();
  writable = await start(true);
});
afterAll(async () => {
  await readOnly.app.close();
  await writable.app.close();
  rmSync(home, { recursive: true, force: true });
});

describe('read-only by default', () => {
  it('tells the browser writes are off in the snapshot', async () => {
    const snap = (await (await fetch(`${readOnly.base}/api/office`)).json()) as Snap;
    expect(snap.capabilities).toEqual({ writes: false });
  });

  it('refuses chat and task creation with a hint, without running anything', async () => {
    const before = runs;
    const chat = await post(readOnly.base, '/api/chat', { roomId: 'dm-campaigns', text: 'hi' });
    const task = await post(readOnly.base, '/api/tasks', { roomId: 'ops', title: 'Restock paper', assignee: 'campaigns' });
    for (const res of [chat, task]) {
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: string }).error).toMatch(/read-only.*DMOS_ALLOW_WRITES=1/i);
    }
    expect(runs).toBe(before);
  });

  it('still answers reads and 404s unknown write paths', async () => {
    expect((await fetch(`${readOnly.base}/api/rooms/ops/messages`)).status).toBe(200);
    expect((await post(readOnly.base, '/api/nope', {})).status).toBe(404);
  });
});

describe('DMOS_ALLOW_WRITES=1', () => {
  it('advertises and allows writes', async () => {
    const snap = (await (await fetch(`${writable.base}/api/office`)).json()) as Snap;
    expect(snap.capabilities).toEqual({ writes: true });
    expect((await post(writable.base, '/api/chat', { roomId: 'dm-campaigns', text: 'hi' })).status).toBe(200);
    expect((await post(writable.base, '/api/tasks', { roomId: 'ops', title: 'Restock paper', assignee: 'campaigns' })).status).toBe(201);
  });
});

describe('GET /api/health', () => {
  it('answers ok for container health checks', async () => {
    const res = await fetch(`${readOnly.base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
