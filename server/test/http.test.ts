import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
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
const home = mkdtempSync(path.join(tmpdir(), 'dmos-http-'));
const headshots = path.join(home, 'headshots'); // DMOS_HEADSHOTS_DIR
mkdirSync(headshots, { recursive: true });
writeFileSync(path.join(headshots, 'tech.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
writeFileSync(path.join(headshots, 'general.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
writeFileSync(path.join(home, '.env'), 'SECRET=1');

let release: () => void = () => {};
const runner: Runner = async (_file, args) => {
  if (args[0] === 'kanban') return { stdout: JSON.stringify({ id: 't_new1', status: 'ready', created_at: T }), stderr: '', code: 0, timedOut: false };
  if (args.includes('--query=[Ops room] slow')) await new Promise<void>((r) => { release = r; });
  return { stdout: 'Bears. Beets. Battlestar Galactica.\n', stderr: '', code: 0, timedOut: false };
};

let app: App;
let base: string;
beforeAll(async () => {
  app = createApp({
    adapters: [createHermesAdapter({ source: createFixtureSource({ fixture }), runner, hermesBin: '/fake/hermes', now: () => T })],
    hermesHome: home, headshotDir: headshots, pollIntervalMs: 60_000, now: () => T, allowWrites: true, // these tests exercise the write endpoints
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await app.close();
  rmSync(home, { recursive: true, force: true });
});

const postJson = (p: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: DEV, ...headers }, body: JSON.stringify(body) });

describe('GET /api/office', () => {
  it('returns the snapshot with security headers and no chat keys', async () => {
    const res = await fetch(`${base}/api/office`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const text = await res.text();
    expect(text).not.toMatch(/chat-|c_[0-9a-f]{16}/);
    const snap = JSON.parse(text);
    expect(snap.people).toHaveLength(23);
    expect(snap.presence.michael.status).toBe('meeting');
  });
});

describe('CORS and host checks', () => {
  it('allows the Vite dev origin only', async () => {
    const ok = await fetch(`${base}/api/office`, { headers: { origin: DEV } });
    expect(ok.headers.get('access-control-allow-origin')).toBe(DEV);
    const evil = await fetch(`${base}/api/office`, { headers: { origin: 'http://evil.example' } });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
    const preflight = await fetch(`${base}/api/chat`, { method: 'OPTIONS', headers: { origin: 'http://evil.example', 'access-control-request-method': 'POST' } });
    expect(preflight.status).toBe(403);
    const good = await fetch(`${base}/api/chat`, { method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:5173', 'access-control-request-method': 'POST' } });
    expect(good.status).toBe(204);
    expect(good.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('refuses writes from other origins and non-JSON bodies', async () => {
    expect((await postJson('/api/chat', { roomId: 'ops', text: 'hi' }, { origin: 'http://evil.example' })).status).toBe(403);
    const form = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'text/plain', origin: DEV }, body: '{}' });
    expect(form.status).toBe(415);
  });

  it('refuses a foreign Host header (DNS rebinding)', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const url = new URL(`${base}/api/office`);
      request({ host: url.hostname, port: url.port, path: url.pathname, headers: { host: 'evil.example:4318' } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      }).on('error', reject).end();
    });
    expect(status).toBe(403);
  });
});

describe('GET /api/rooms/:id/messages', () => {
  it('returns room messages', async () => {
    const res = await fetch(`${base}/api/rooms/ops/messages`);
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(4);
  });

  it('returns [] with a reason header when there is no local source', async () => {
    const res = await fetch(`${base}/api/rooms/dm-health/messages`, { headers: { origin: DEV } });
    expect(await res.json()).toEqual([]);
    expect(res.headers.get('x-dmos-messages-reason')).toBe('not-in-fixture');
    expect(res.headers.get('access-control-expose-headers')).toContain('X-DMOS-Messages-Reason');
  });

  it('404s unknown rooms', async () => {
    expect((await fetch(`${base}/api/rooms/nope/messages`)).status).toBe(404);
    expect((await fetch(`${base}/api/rooms/..%2F..%2Fetc/messages`)).status).toBe(404);
  });
});

describe('POST /api/chat', () => {
  it('returns the bot reply as ChatMessages', async () => {
    const res = await postJson('/api/chat', { roomId: 'dm-campaigns', text: 'Identity theft is not a joke' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([expect.objectContaining({ roomId: 'dm-campaigns', authorId: 'dwight', text: 'Bears. Beets. Battlestar Galactica.' })]);
  });

  it('validates input', async () => {
    expect((await postJson('/api/chat', { roomId: 'ops', text: '' })).status).toBe(400);
    expect((await postJson('/api/chat', { roomId: 'ops', text: 'x'.repeat(2001) })).status).toBe(400);
    expect((await postJson('/api/chat', { roomId: 'nope', text: 'hi' })).status).toBe(404);
    expect((await postJson('/api/chat', ['array'])).status).toBe(400);
    const bad = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
    expect(bad.status).toBe(400);
    const big = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roomId: 'ops', text: 'x'.repeat(20_000) }) });
    expect(big.status).toBe(413);
  });

  it('answers 429 while the same bot is still busy', async () => {
    const first = postJson('/api/chat', { roomId: 'ops', text: 'slow' });
    await new Promise((r) => setTimeout(r, 30));
    const second = await postJson('/api/chat', { roomId: 'rnd', text: 'also tech' });
    expect(second.status).toBe(429);
    release();
    expect((await first).status).toBe(200);
  });
});

describe('POST /api/tasks', () => {
  it('creates a shared Ops card', async () => {
    const res = await postJson('/api/tasks', { roomId: 'ops', title: 'Restock paper', assignee: 'dwight' });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: 't_new1', title: 'Restock paper', status: 'todo', ownerId: 'dwight', roomId: 'ops', shared: true });
  });

  it('rejects other rooms', async () => {
    expect((await postJson('/api/tasks', { roomId: 'hq', title: 'x', assignee: 'dwight' })).status).toBe(400);
  });
});

describe('GET /api/headshots/:profile', () => {
  it('serves whitelisted headshots, <profile>.jpg or else <profile>.png', async () => {
    const tech = await fetch(`${base}/api/headshots/tech`);
    expect(tech.status).toBe(200);
    expect(tech.headers.get('content-type')).toBe('image/jpeg');
    const general = await fetch(`${base}/api/headshots/general`);
    expect(general.headers.get('content-type')).toBe('image/png');
  });

  it('404s anything else', async () => {
    for (const p of ['stamford', '..%2F.env', '.env', 'cmo', 'TECH']) {
      expect((await fetch(`${base}/api/headshots/${p}`)).status).toBe(404);
    }
  });
});

describe('routing', () => {
  it('404s malformed escapes instead of erroring', async () => {
    expect((await fetch(`${base}/api/headshots/%E0%A4%A`)).status).toBe(404);
    expect((await fetch(`${base}/api/rooms/%E0%A4%A/messages`)).status).toBe(404);
  });

  it('404s unknown paths and 405s wrong methods', async () => {
    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
    expect((await fetch(`${base}/api/office`, { method: 'DELETE' })).status).toBe(405);
  });
});
