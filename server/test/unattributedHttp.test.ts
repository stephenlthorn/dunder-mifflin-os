// GET /api/unattributed (Creed's corner): read-only, signed in like every /api route, scrubbed.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApp, type App } from '../src/http/app.ts';
import { createHermesAdapter } from '../src/adapters/hermes.ts';
import { createWebhookAdapter } from '../src/adapters/webhook.ts';
import { createFixtureSource, loadFixture } from '../src/hermes/fixtureSource.ts';
import type { Runner } from '../src/chat/runner.ts';
import type { UnattributedReport } from '../../shared/unattributed.ts';
import { LEAK_PATTERNS } from './helpers/leakScan.ts';

const fixture = loadFixture();
const T = Date.parse(fixture.state.recordedAt) / 1000;
const TOKEN = 'test-ingest-token-0123456789abcdef';
const ACCESS = 'access-token-0123456789abcdef';
const runner: Runner = async () => ({ stdout: '', stderr: '', code: 0, timedOut: false });

function start(extra: { accessToken?: string } = {}): Promise<{ app: App; base: string }> {
  const hermes = createHermesAdapter({ source: createFixtureSource({ fixture }), runner, hermesBin: 'h', now: () => T });
  const webhook = createWebhookAdapter({ token: TOKEN, now: () => T * 1000 });
  for (const id of ['alpha', 'bravo', 'charlie', 'delta']) {
    webhook.routes![0]!.handle({ params: [id], body: { type: 'activity', text: `${id} at work with key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123` } });
  }
  const app = createApp({ adapters: [hermes, webhook], hermesHome: '/nonexistent', headshotDir: null, pollIntervalMs: 60_000, now: () => T, ...extra });
  return new Promise((resolve) => app.server.listen(0, '127.0.0.1', () => resolve({ app, base: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}` })));
}

describe('GET /api/unattributed', () => {
  let app: App;
  let base: string;
  beforeAll(async () => ({ app, base } = await start()));
  afterAll(async () => { await app?.close(); });

  it('lists the webhook agent that found no desk, with no secrets in the text', async () => {
    const res = await fetch(`${base}/api/unattributed`);
    expect(res.status).toBe(200);
    const text = await res.text();
    const report = JSON.parse(text) as UnattributedReport;
    expect(Date.parse(report.generatedAt)).toBe(T * 1000);
    expect(report.items).toContainEqual(expect.objectContaining({ id: 'agent:webhook/delta', kind: 'agent', agentId: 'delta' }));
    expect(report.items.filter((i) => i.kind === 'agent')).toHaveLength(1); // three of the four sit at the spare desks
    expect(LEAK_PATTERNS.filter(([, re]) => re.test(text)).map(([k]) => k)).toEqual([]);
  });

  it('is a GET only', async () => {
    const post = await fetch(`${base}/api/unattributed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(post.status).toBe(405);
  });
});

describe('GET /api/unattributed with sign-in on', () => {
  it('wants a signed-in browser', async () => {
    const { app, base } = await start({ accessToken: ACCESS });
    try {
      expect((await fetch(`${base}/api/unattributed`)).status).toBe(401);
    } finally {
      await app.close();
    }
  });
});
