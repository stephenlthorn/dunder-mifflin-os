import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os, { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp, type App } from '../src/http/app.ts';
import { createHermesAdapter } from '../src/adapters/hermes.ts';
import { createFixtureSource, loadFixture } from '../src/hermes/fixtureSource.ts';
import { imageType } from '../src/http/images.ts';
import { readPortrait } from '../src/http/portraits.ts';
import { headshotsDirFrom, portraitsDirFrom } from '../src/config.ts';
import type { Runner } from '../src/chat/runner.ts';

const JPEG = (n: number) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, n, n, n]);
const PNG = (n: number) => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n]);

const root = mkdtempSync(path.join(tmpdir(), 'dmos-portraits-'));
const home = path.join(root, 'hermes');
const headshotDir = path.join(root, 'headshots'); // DMOS_HEADSHOTS_DIR
const portraitsDir = path.join(root, 'portraits');
mkdirSync(headshotDir, { recursive: true });
mkdirSync(portraitsDir, { recursive: true });
writeFileSync(path.join(headshotDir, 'campaigns.jpg'), JPEG(1)); // Dwight's Hermes headshot, no portrait file
writeFileSync(path.join(headshotDir, 'chief.jpg'), JPEG(2)); // Pam has both: the portrait wins
writeFileSync(path.join(portraitsDir, 'pam.jpg'), JPEG(3));
writeFileSync(path.join(portraitsDir, 'pam.png'), PNG(3));
writeFileSync(path.join(portraitsDir, 'jim.jpg'), JPEG(4));
writeFileSync(path.join(portraitsDir, 'jarvis.png'), PNG(5));
writeFileSync(path.join(portraitsDir, 'ira.jpg'), JPEG(6));
writeFileSync(path.join(portraitsDir, 'kevin.jpg'), 'not an image at all');
mkdirSync(path.join(portraitsDir, 'creed.jpg'));
writeFileSync(path.join(portraitsDir, 'meredith.jpg'), JPEG(7));
chmodSync(path.join(portraitsDir, 'meredith.jpg'), 0o000); // unreadable
writeFileSync(path.join(portraitsDir, 'secret.jpg'), JPEG(8)); // not a person on the map
writeFileSync(path.join(root, 'outside.jpg'), JPEG(9));

const runner: Runner = async () => ({ stdout: '', stderr: '', code: 0, timedOut: false });
const fixture = loadFixture();
const T = Date.parse(fixture.state.recordedAt) / 1000;

async function start(dir: string | null): Promise<{ app: App; base: string }> {
  const app = createApp({
    adapters: [createHermesAdapter({ source: createFixtureSource({ fixture }), runner, hermesBin: '/fake/hermes', now: () => T })],
    hermesHome: home, headshotDir,
    portraitsDir: dir, pollIntervalMs: 60_000, now: () => T,
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  return { app, base: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}` };
}

let app: App;
let base: string;
beforeAll(async () => ({ app, base } = await start(portraitsDir)));
afterAll(async () => {
  await app.close();
  chmodSync(path.join(portraitsDir, 'meredith.jpg'), 0o644);
  rmSync(root, { recursive: true, force: true });
});

const get = (id: string) => fetch(`${base}/api/portraits/${id}`);
const bytes = async (res: Response) => Buffer.from(await res.arrayBuffer());

describe('GET /api/portraits/:personId', () => {
  it('serves a local JPEG portrait with its type, a one-day cache and nosniff', async () => {
    const res = await get('jim');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toMatch(/max-age=86400/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await bytes(res)).toEqual(JPEG(4));
  });

  it('serves a .png portrait as image/png and prefers .jpg when both exist', async () => {
    const jarvis = await get('jarvis');
    expect(jarvis.headers.get('content-type')).toBe('image/png');
    expect(await bytes(jarvis)).toEqual(PNG(5));
    expect(await bytes(await get('pam'))).toEqual(JPEG(3));
    expect((await get('ira')).status).toBe(200);
  });

  it("falls back to the Hermes bot headshot for a botted person without a portrait file", async () => {
    const res = await get('dwight');
    expect(res.status).toBe(200);
    expect(await bytes(res)).toEqual(JPEG(1));
  });

  it('404s people with neither a portrait nor a bot headshot, and files that are not JPEG/PNG', async () => {
    for (const id of ['roy', 'andy', 'kevin', 'creed', 'meredith']) expect((await get(id)).status, id).toBe(404);
  });

  it('only answers for people on the map: no other files, no traversal', async () => {
    const bad = ['secret', '..%2Foutside', '..', '.', 'jim.jpg', 'JIM', '%2e%2e%2f%2e%2e%2fetc%2fpasswd', 'jim%00', '%E0%A4%A', 'jim%2F', 'hank'];
    for (const id of bad) expect((await get(id)).status, id).toBe(404);
    expect((await fetch(`${base}/api/portraits/`)).status).toBe(404);
    expect((await fetch(`${base}/api/portraits/jim/extra`)).status).toBe(404);
  });

  it('never puts the directory in a response or a log line', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => (lines.push(String(chunk)), true));
    vi.stubEnv('DMOS_QUIET', '0');
    try {
      for (const id of ['meredith', 'creed', 'kevin', 'roy', 'secret', '..%2Foutside']) {
        const text = await (await get(id)).text();
        expect(text).toBe('{"error":"No portrait"}');
      }
    } finally {
      vi.unstubAllEnvs();
      spy.mockRestore();
    }
    expect(lines.join('')).not.toContain(root);
    expect(lines.join('')).not.toContain(os.homedir());
    expect(lines.some((l) => l.includes('EACCES'))).toBe(true); // the unreadable file is reported, by code only
  });

  it('still falls back to bot headshots when no portraits directory is configured', async () => {
    const other = await start(null);
    try {
      expect((await fetch(`${other.base}/api/portraits/dwight`)).status).toBe(200);
      expect((await fetch(`${other.base}/api/portraits/jim`)).status).toBe(404);
    } finally {
      await other.app.close();
    }
  });

  it('keeps /api/headshots/:profile working through the same image code', async () => {
    const res = await fetch(`${base}/api/headshots/campaigns`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toMatch(/max-age=86400/);
  });
});

describe('portrait helpers', () => {
  it('tells JPEG and PNG apart by their bytes, and refuses anything else', () => {
    expect(imageType(JPEG(0))).toBe('image/jpeg');
    expect(imageType(PNG(0))).toBe('image/png');
    expect(imageType(Buffer.from('GIF89a'))).toBeNull();
    expect(imageType(Buffer.alloc(0))).toBeNull();
  });

  it('reads portraits for allow-listed ids only', async () => {
    const dirs = { portraitsDir, headshotDir };
    expect(await readPortrait('jim', dirs)).toEqual({ body: JPEG(4), contentType: 'image/jpeg' });
    expect(await readPortrait('../outside', dirs)).toBeNull();
    expect(await readPortrait('secret', dirs)).toBeNull();
  });

  it('defaults the portraits directory to ~/.dunder-mifflin-os/portraits and expands ~ in DMOS_PORTRAITS_DIR', () => {
    expect(portraitsDirFrom(undefined, '/h')).toBe(path.join('/h', '.dunder-mifflin-os', 'portraits'));
    expect(portraitsDirFrom('~/pics', '/h')).toBe(path.join('/h', 'pics'));
    expect(portraitsDirFrom('/abs/pics', '/h')).toBe('/abs/pics');
    expect(portraitsDirFrom('', '/h')).toBe(path.join('/h', '.dunder-mifflin-os', 'portraits'));
  });

  it('defaults the headshots directory to ~/.dunder-mifflin-os/headshots and expands ~ in DMOS_HEADSHOTS_DIR', () => {
    expect(headshotsDirFrom(undefined, '/h')).toBe(path.join('/h', '.dunder-mifflin-os', 'headshots'));
    expect(headshotsDirFrom('~/bots', '/h')).toBe(path.join('/h', 'bots'));
    expect(headshotsDirFrom('/abs/bots', '/h')).toBe('/abs/bots');
  });
});
