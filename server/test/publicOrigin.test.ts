import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp, type App } from '../src/http/app.ts';
import { createHermesAdapter } from '../src/adapters/hermes.ts';
import { createFixtureSource, loadFixture } from '../src/hermes/fixtureSource.ts';
import { allowedHosts, allowedOrigins, parsePublicOrigins } from '../src/config.ts';
import type { Runner } from '../src/chat/runner.ts';

const TAILNET = 'https://office-box.example-tailnet.ts.net:4318';
const TAILNET_HOST = 'office-box.example-tailnet.ts.net';

describe('parsePublicOrigins', () => {
  it('reads a comma-separated list of https origins', () => {
    expect(parsePublicOrigins(undefined)).toEqual([]);
    expect(parsePublicOrigins('')).toEqual([]);
    expect(parsePublicOrigins(` ${TAILNET} , https://box.example.ts.net `)).toEqual([TAILNET, 'https://box.example.ts.net']);
  });

  it('rejects anything that is not a bare https origin', () => {
    for (const bad of ['http://x.ts.net', 'https://x.ts.net/path', 'x.ts.net', 'https://user@x.ts.net', 'https://x.ts.net?q=1']) {
      expect(() => parsePublicOrigins(bad)).toThrow(/DMOS_PUBLIC_ORIGINS/);
    }
  });
});

describe('allowed hosts and origins', () => {
  it('adds public origins to the write allow-list and their hostnames to the host allow-list', () => {
    expect(allowedOrigins(4318, [TAILNET]).has(TAILNET)).toBe(true);
    expect(allowedOrigins(4318).has(TAILNET)).toBe(false);
    expect([...allowedHosts([TAILNET])]).toEqual([TAILNET_HOST]);
    expect(allowedHosts([]).size).toBe(0);
  });
});

describe('a server published through tailscale serve', () => {
  const fixture = loadFixture();
  const T = Date.parse(fixture.state.recordedAt) / 1000;
  const home = mkdtempSync(path.join(tmpdir(), 'dmos-public-'));
  const runner: Runner = async () => ({ stdout: 'Bears. Beets. Battlestar Galactica.\n', stderr: '', code: 0, timedOut: false });
  let app: App;
  let port = 0;

  beforeAll(async () => {
    app = createApp({
      adapters: [createHermesAdapter({ source: createFixtureSource({ fixture }), runner, hermesBin: '/fake/hermes', now: () => T })],
      hermesHome: home, headshotDir: home,
      pollIntervalMs: 60_000, now: () => T,
      allowedOrigins: allowedOrigins(4318, [TAILNET]), allowedHosts: allowedHosts([TAILNET]), allowWrites: true,
    });
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    port = (app.server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    await app.close();
    rmSync(home, { recursive: true, force: true });
  });

  const send = (method: string, p: string, headers: Record<string, string>, body?: string) =>
    new Promise<number>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end(body);
    });

  it('serves reads addressed to the tailnet hostname', async () => {
    expect(await send('GET', '/api/office', { host: `${TAILNET_HOST}:4318` })).toBe(200);
    expect(await send('GET', '/api/office', { host: TAILNET_HOST })).toBe(200);
  });

  it('still refuses any other Host header', async () => {
    expect(await send('GET', '/api/office', { host: 'evil.example' })).toBe(403);
    expect(await send('GET', '/api/office', { host: 'other-box.example-tailnet.ts.net' })).toBe(403);
  });

  it('accepts writes from the tailnet origin and refuses others', async () => {
    const body = JSON.stringify({ roomId: 'dm-general', text: 'hi' });
    const json = { host: TAILNET_HOST, 'content-type': 'application/json' };
    expect(await send('POST', '/api/chat', { ...json, origin: TAILNET }, body)).toBe(200);
    expect(await send('POST', '/api/chat', { ...json, origin: 'https://evil.example' }, body)).toBe(403);
  });
});
