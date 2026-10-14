import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp, type App } from '../src/http/app.ts';
import { createHermesAdapter } from '../src/adapters/hermes.ts';
import { createFixtureSource, loadFixture } from '../src/hermes/fixtureSource.ts';
import { allowedHosts } from '../src/config.ts';
import { SESSION_COOKIE } from '../src/http/auth.ts';
import type { Runner } from '../src/chat/runner.ts';

const TOKEN = 'remote-access-token-0123456789abcdef';
const TAILNET = 'https://office-box.example-tailnet.ts.net:4318';
const TAILNET_HOST = 'office-box.example-tailnet.ts.net';
const fixture = loadFixture();
const T = Date.parse(fixture.state.recordedAt) / 1000;
const top = mkdtempSync(path.join(tmpdir(), 'dmos-remote-'));
const dist = path.join(top, 'dist');
mkdirSync(dist, { recursive: true });
writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Dunder Mifflin OS</title>');
const runner: Runner = async () => ({ stdout: '', stderr: '', code: 0, timedOut: false });

type Reply = { status: number; headers: Record<string, string | string[] | undefined>; body: string };

let app: App;
let port = 0;
let origin = '';
const origins = new Set([TAILNET]); // the server's own origin is added once the test port is known

function send(method: string, p: string, headers: Record<string, string> = {}, body?: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: p, method, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

const form = (fields: Record<string, string>, headers: Record<string, string> = {}) =>
  send('POST', '/login', { 'content-type': 'application/x-www-form-urlencoded', origin, ...headers }, new URLSearchParams(fields).toString());

const setCookie = (r: Reply) => (Array.isArray(r.headers['set-cookie']) ? r.headers['set-cookie'][0] ?? '' : '');
const sessionOf = (r: Reply) => setCookie(r).split(';')[0] ?? '';

beforeAll(async () => {
  app = createApp({
    adapters: [createHermesAdapter({ source: createFixtureSource({ fixture }), runner, hermesBin: '/fake/hermes', now: () => T })],
    hermesHome: top, headshotDir: top, pollIntervalMs: 60_000, now: () => T, webRoot: dist, accessToken: TOKEN,
    allowedOrigins: origins, allowedHosts: allowedHosts([TAILNET]),
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  port = (app.server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
  origins.add(origin);
});
afterAll(async () => {
  await app.close();
  rmSync(top, { recursive: true, force: true });
});

describe('without a session', () => {
  it('answers the health check', async () => {
    expect((await send('GET', '/api/health')).status).toBe(200);
  });

  it('refuses every API call with 401 JSON', async () => {
    for (const p of ['/api/office', '/api/events', '/api/rooms/ops/messages', '/api/portraits/dwight']) {
      const res = await send('GET', p);
      expect(res.status, p).toBe(401);
      expect(JSON.parse(res.body), p).toEqual({ error: 'Sign in required' });
    }
  });

  it('sends pages to the sign-in page, remembering where they were going', async () => {
    const res = await send('GET', '/?demo=1');
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/login?next=%2F%3Fdemo%3D1');
    expect(res.body).not.toContain('Dunder Mifflin OS</title>');
  });
});

describe('the sign-in page', () => {
  it('is a no-JS form with strict headers', async () => {
    const res = await send('GET', '/login?next=%2F%3Fdemo%3D1');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("form-action 'self'");
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('same-origin'); // a form POST under no-referrer would send Origin: null
    expect(res.body).toContain('<form method="post" action="/login"');
    expect(res.body).toContain('name="token"');
    expect(res.body).toContain('type="password"');
    expect(res.body).toContain('value="/?demo=1"');
    expect(res.body).not.toContain('<script');
  });

  it('escapes the next path', async () => {
    const res = await send('GET', `/login?next=${encodeURIComponent('/"><img src=x>')}`);
    expect(res.body).not.toContain('"><img');
  });
});

describe('signing in', () => {
  it('rejects a wrong token without a cookie', async () => {
    const res = await form({ token: 'wrong-token-wrong-token', next: '/' });
    expect(res.status).toBe(401);
    expect(res.body).toContain('did not match');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('sets an HttpOnly SameSite=Strict session cookie and redirects to next', async () => {
    const res = await form({ token: TOKEN, next: '/?demo=1' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/?demo=1');
    const cookie = setCookie(res);
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain(TOKEN);
    expect(cookie).not.toContain('Secure'); // plain loopback: see needsSecureCookie

    const session = sessionOf(res);
    expect((await send('GET', '/api/office', { cookie: session })).status).toBe(200);
    expect((await send('GET', '/', { cookie: session })).status).toBe(200);
  });

  it('marks the cookie Secure behind the published https origin', async () => {
    const res = await form({ token: TOKEN }, { host: TAILNET_HOST, origin: TAILNET });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/');
    expect(setCookie(res)).toContain('Secure');
  });

  it('never redirects off-site', async () => {
    const res = await form({ token: TOKEN, next: '//evil.example/' });
    expect(res.headers.location).toBe('/');
  });

  it('refuses sign-in posts from other origins, null origins and JSON bodies', async () => {
    expect((await form({ token: TOKEN }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await form({ token: TOKEN }, { origin: 'null' })).status).toBe(403);
    const json = await send('POST', '/login', { 'content-type': 'application/json', origin }, JSON.stringify({ token: TOKEN }));
    expect(json.status).toBe(415);
  });
});

describe('logs and rate limiting', () => {
  it('never writes the token to the log', async () => {
    const quiet = process.env.DMOS_QUIET;
    delete process.env.DMOS_QUIET;
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      await form({ token: `${TOKEN}-nope` });
      await form({ token: TOKEN });
    } finally {
      spy.mockRestore();
      process.env.DMOS_QUIET = quiet;
    }
    const logged = writes.join('');
    expect(logged).toContain('auth.login_failed');
    expect(logged).toContain('auth.login');
    expect(logged).not.toContain(TOKEN);
  });

  it('answers 429 after too many attempts, even with the right token', async () => {
    let last: Reply | null = null;
    for (let i = 0; i < 12; i += 1) last = await form({ token: 'still-wrong-still-wrong' });
    expect(last?.status).toBe(429);
    expect((await form({ token: TOKEN })).status).toBe(429);
  });
});
