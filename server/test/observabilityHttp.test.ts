// GET /api/people/:id/timeline and GET /api/usage over the recorded fixtures plus webhook and Claude Code agents.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { createApp, type App } from '../src/http/app.ts';
import { createHermesAdapter } from '../src/adapters/hermes.ts';
import { createWebhookAdapter } from '../src/adapters/webhook.ts';
import { createClaudeCodeAdapter } from '../src/adapters/claudeCode/adapter.ts';
import { createFixtureSource, loadFixture } from '../src/hermes/fixtureSource.ts';
import type { AgentAdapter } from '../src/adapters/types.ts';
import type { Runner } from '../src/chat/runner.ts';
import type { TimelineResponse, UsageReport } from '../../shared/observability.ts';
import { LEAK_PATTERNS } from './helpers/leakScan.ts';

const fixture = loadFixture();
const T = Date.parse(fixture.state.recordedAt) / 1000;
const TOKEN = 'test-ingest-token-0123456789abcdef';
const ACCESS = 'access-token-0123456789abcdef';
const runner: Runner = async () => ({ stdout: '', stderr: '', code: 0, timedOut: false });
const SESSION = JSON.parse(readFileSync(new URL('./fixtures/claude-code/session.json', import.meta.url), 'utf8')).payloads as unknown[];

function adapters(): AgentAdapter[] {
  const hermes = createHermesAdapter({ source: createFixtureSource({ fixture }), runner, hermesBin: 'h', now: () => T });
  const webhook = createWebhookAdapter({ token: TOKEN, now: () => T * 1000 });
  webhook.routes![0]!.handle({ params: ['deploy-bot'], body: { type: 'activity', text: 'Deploying v2 with key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123' } });
  const claude = createClaudeCodeAdapter({ token: TOKEN, now: () => T * 1000 });
  for (const p of SESSION.slice(0, -1)) claude.routes![0]!.handle({ params: [], body: p });
  return [hermes, webhook, claude];
}

async function start(extra: { accessToken?: string } = {}): Promise<{ app: App; base: string }> {
  const app = createApp({ adapters: adapters(), hermesHome: '/nonexistent', headshotDir: '/nonexistent', pollIntervalMs: 60_000, now: () => T, ...extra });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  return { app, base: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}` };
}

const leaks = (text: string) => LEAK_PATTERNS.filter(([, re]) => re.test(text)).map(([k]) => k);
let app: App;
let base: string;
beforeAll(async () => ({ app, base } = await start()));
afterAll(async () => { await app?.close(); });
const get = async (path: string) => {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: await res.json() as unknown };
};

describe('GET /api/people/:id/timeline', () => {
  it('returns a Hermes bot\'s last 24 hours, newest first, scrubbed', async () => {
    const { status, body } = await get('/api/people/dwight/timeline');
    const t = body as TimelineResponse;
    expect(status).toBe(200);
    expect(t).toMatchObject({ personId: 'dwight', available: true, adapter: { id: 'hermes', label: 'Hermes' }, since: new Date((T - 86_400) * 1000).toISOString() });
    expect(t.events.length).toBeGreaterThan(5);
    expect(leaks(JSON.stringify(t))).toEqual([]);
  });

  it('takes since and limit, and says when there was more', async () => {
    const since = new Date((T - 6 * 3600) * 1000).toISOString();
    const t = (await get(`/api/people/dwight/timeline?limit=2&since=${encodeURIComponent(since)}`)).body as TimelineResponse;
    expect(t.events).toHaveLength(2);
    expect(t.truncated).toBe(true);
    expect(t.since).toBe(since);
    expect(Date.parse(t.events[1]!.at)).toBeGreaterThanOrEqual(Date.parse(since));
  });

  it('refuses a bad since or limit with 400 and an unknown person with 404', async () => {
    expect((await get('/api/people/dwight/timeline?since=yesterday')).status).toBe(400);
    expect((await get('/api/people/dwight/timeline?limit=0')).status).toBe(400);
    expect((await get('/api/people/gandalf/timeline')).status).toBe(404);
    expect((await get('/api/people/..%2Fetc/timeline')).status).toBe(404);
  });

  it('says why there is no timeline for someone without a bot', async () => {
    const t = (await get('/api/people/jim/timeline')).body as TimelineResponse;
    expect(t).toMatchObject({ personId: 'jim', available: false, reason: 'No bot yet', events: [] });
  });

  it('shows webhook and Claude Code temps\' timelines too', async () => {
    const hook = (await get('/api/people/temp-webhook-deploy-bot/timeline')).body as TimelineResponse;
    expect(hook).toMatchObject({ available: true, adapter: { id: 'webhook', label: 'Webhook' } });
    expect(hook.events[0]).toMatchObject({ kind: 'activity', title: 'Deploying v2 with key [secret]', source: 'webhook' });
    const cc = (await get('/api/people/temp-claude-code-paper-site/timeline')).body as TimelineResponse;
    expect(cc.events.map((e) => e.kind)).toContain('tool.call');
  });
});

describe('GET /api/usage', () => {
  it('lists tokens and estimated cost per bot with totals, and no zeros for adapters without usage', async () => {
    const { status, body } = await get('/api/usage?period=30d');
    const r = body as UsageReport;
    expect(status).toBe(200);
    expect(r).toMatchObject({ period: '30d', currency: 'USD', estimate: true, priceTable: { asOf: '2026-10-06' } });
    expect(r.priceTable.models).toBeGreaterThan(5);
    const dwight = r.rows.find((row) => row.personId === 'dwight')!;
    expect(dwight).toMatchObject({ name: 'Dwight Schrute', adapterId: 'hermes', adapterLabel: 'Hermes' });
    expect(dwight.usage!.inputTokens).toBeGreaterThan(0);
    const cc = r.rows.find((row) => row.personId === 'temp-claude-code-paper-site')!;
    expect(cc).toMatchObject({ usage: null, unavailable: 'No usage data from Claude Code' });
    expect(r.rows.find((row) => row.personId === 'temp-webhook-deploy-bot')).toMatchObject({ usage: null, unavailable: 'No usage data from Webhook' });
    const counted = r.rows.flatMap((row) => (row.usage ? [row.usage] : []));
    expect(r.totals.inputTokens).toBe(counted.reduce((n, u) => n + u.inputTokens, 0));
    expect(r.rows.at(-1)?.usage).toBeNull(); // unavailable rows come last
    const costs = r.rows.flatMap((row) => (row.usage?.cost != null ? [row.usage.cost] : []));
    expect([...costs].sort((a, b) => b - a)).toEqual(costs);
    expect(r.rows.some((row) => row.personId === 'jim')).toBe(false);
  });

  it('defaults to today and refuses unknown periods', async () => {
    expect(((await get('/api/usage')).body as UsageReport).period).toBe('today');
    expect((await get('/api/usage?period=1y')).status).toBe(400);
  });
});

describe('sign-in', () => {
  it('protects both endpoints like the rest of /api', async () => {
    const locked = await start({ accessToken: ACCESS });
    try {
      for (const path of ['/api/usage?period=7d', '/api/people/dwight/timeline']) {
        expect((await fetch(`${locked.base}${path}`)).status, path).toBe(401);
      }
    } finally {
      await locked.app.close();
    }
  });
});
