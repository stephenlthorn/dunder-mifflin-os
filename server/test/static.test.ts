import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp, type App } from '../src/http/app.ts';
import { createHermesAdapter } from '../src/adapters/hermes.ts';
import { createFixtureSource, loadFixture } from '../src/hermes/fixtureSource.ts';
import { allowedOrigins } from '../src/config.ts';
import { contentTypeFor } from '../src/http/staticFiles.ts';
import type { Runner } from '../src/chat/runner.ts';

const fixture = loadFixture();
const T = Date.parse(fixture.state.recordedAt) / 1000;
const top = mkdtempSync(path.join(tmpdir(), 'dmos-static-'));
const dist = path.join(top, 'dist');
mkdirSync(path.join(dist, 'assets'), { recursive: true });
writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Dunder Mifflin OS</title>');
writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), 'console.log("hi")');
writeFileSync(path.join(dist, 'assets', 'index-abc123.css'), 'body{}');
writeFileSync(path.join(dist, 'assets', 'font-x.woff2'), Buffer.from([0x77, 0x4f, 0x46, 0x32]));
writeFileSync(path.join(dist, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
writeFileSync(path.join(dist, '.secret'), 'nope');
writeFileSync(path.join(top, 'outside.txt'), 'outside the web root');

const runner: Runner = async () => ({ stdout: '', stderr: '', code: 0, timedOut: false });

function makeApp(webRoot: string | null): App {
  return createApp({
    adapters: [createHermesAdapter({ source: createFixtureSource({ fixture }), runner, hermesBin: '/fake/hermes', now: () => T })],
    hermesHome: top, headshotDir: top,
    pollIntervalMs: 60_000, now: () => T, webRoot,
  });
}

async function listen(app: App): Promise<string> {
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

/** Raw request so the path is sent exactly as written (fetch normalises "../"). */
function rawGet(base: string, rawPath: string, method = 'GET', headers: Record<string, string> = {}): Promise<{ status: number; body: string; type: string }> {
  const { port } = new URL(base);
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: rawPath, method, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, type: String(res.headers['content-type'] ?? '') }));
    });
    req.on('error', reject);
    req.end();
  });
}

let app: App;
let base: string;
beforeAll(async () => {
  app = makeApp(dist);
  base = await listen(app);
});
afterAll(async () => {
  await app.close();
  rmSync(top, { recursive: true, force: true });
});

describe('serving the built web app (npm run start)', () => {
  it('serves index.html at / without caching', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await res.text()).toContain('Dunder Mifflin OS');
  });

  it('serves hashed assets with the right MIME types and long caching', async () => {
    const js = await fetch(`${base}/assets/index-abc123.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(js.headers.get('cache-control')).toMatch(/immutable/);
    expect((await fetch(`${base}/assets/index-abc123.css`)).headers.get('content-type')).toBe('text/css; charset=utf-8');
    expect((await fetch(`${base}/assets/font-x.woff2`)).headers.get('content-type')).toBe('font/woff2');
    expect((await fetch(`${base}/logo.svg`)).headers.get('content-type')).toBe('image/svg+xml');
  });

  it('falls back to index.html for app routes (SPA), but 404s missing files', async () => {
    const route = await fetch(`${base}/rooms/ops?demo=0`);
    expect(route.status).toBe(200);
    expect(await route.text()).toContain('Dunder Mifflin OS');
    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404);
  });

  it('keeps /api/* as JSON (never the SPA fallback)', async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect((await fetch(`${base}/api/office`)).status).toBe(200);
  });

  it('never serves files outside the web root or dotfiles', async () => {
    for (const p of ['/../outside.txt', '/%2e%2e/outside.txt', '/assets/..%2f..%2foutside.txt', '/.secret', '/%00index.html']) {
      const res = await rawGet(base, p);
      expect(res.body, p).not.toContain('outside the web root');
      expect(res.body, p).not.toContain('nope');
      expect([400, 404], p).toContain(res.status);
    }
  });

  it('answers HEAD without a body and refuses other methods', async () => {
    const head = await rawGet(base, '/', 'HEAD');
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    expect((await rawGet(base, '/', 'DELETE')).status).toBe(405);
  });

  it('still rejects foreign Host headers (DNS rebinding)', async () => {
    const res = await rawGet(base, '/', 'GET', { host: 'evil.example:4318' });
    expect(res.status).toBe(403);
    expect(res.body).not.toContain('Dunder Mifflin OS');
  });
});

describe('without a web root (npm run dev)', () => {
  it('serves only the API', async () => {
    const apiOnly = makeApp(null);
    const url = await listen(apiOnly);
    try {
      const res = await fetch(`${url}/`);
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toMatch(/application\/json/);
    } finally {
      await apiOnly.close();
    }
  });
});

describe('MIME types and origins', () => {
  it('maps the extensions a Vite build emits', () => {
    expect(contentTypeFor('a.mjs')).toBe('text/javascript; charset=utf-8');
    expect(contentTypeFor('a.json')).toBe('application/json; charset=utf-8');
    expect(contentTypeFor('a.png')).toBe('image/png');
    expect(contentTypeFor('a.webp')).toBe('image/webp');
    expect(contentTypeFor('a.ico')).toBe('image/x-icon');
    expect(contentTypeFor('a.woff')).toBe('font/woff');
    expect(contentTypeFor('a.map')).toBe('application/json; charset=utf-8');
    expect(contentTypeFor('a.unknown')).toBe('application/octet-stream');
  });

  it('allows the Vite dev origin and the server\'s own origin (the built app POSTs same-origin)', () => {
    const origins = allowedOrigins(4318);
    expect(origins.has('http://127.0.0.1:5173')).toBe(true);
    expect(origins.has('http://localhost:5173')).toBe(true);
    expect(origins.has('http://127.0.0.1:4318')).toBe(true);
    expect(origins.has('http://localhost:4318')).toBe(true);
    expect(origins.has('http://evil.example')).toBe(false);
  });
});
