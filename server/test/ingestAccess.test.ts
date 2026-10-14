// Inbound agent endpoints next to the access-token guards: they skip the cookie sign-in but need DMOS_INGEST_TOKEN, stay
// rate-limited, work on a read-only server, and don't exist unless their adapter is configured.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApp, type App, type AppDeps, READ_ONLY_ERROR } from '../src/http/app.ts';
import { createHermesAdapter } from '../src/adapters/hermes.ts';
import { createWebhookAdapter } from '../src/adapters/webhook.ts';
import { createClaudeCodeAdapter } from '../src/adapters/claudeCode/adapter.ts';
import { createFixtureSource, loadFixture } from '../src/hermes/fixtureSource.ts';
import type { Runner } from '../src/chat/runner.ts';
import type { OfficeSnapshot } from '../../shared/contract.ts';

const ACCESS = 'remote-access-token-0123456789abcdef';
const INGEST = 'ingest-token-fedcba9876543210-abcdef';
const fixture = loadFixture();
const T = Date.parse(fixture.state.recordedAt) / 1000;
let runs = 0;
const runner: Runner = async () => { runs += 1; return { stdout: 'Bears.\n', stderr: '', code: 0, timedOut: false }; };
const hermes = () => createHermesAdapter({ source: createFixtureSource({ fixture }), runner, hermesBin: '/fake/hermes', now: () => T });

async function start(deps: Partial<AppDeps> & Pick<AppDeps, 'adapters'>): Promise<{ app: App; base: string }> {
  const origins = new Set<string>(); // the server's own origin, known once it listens (the sign-in form posts from it)
  const app = createApp({ hermesHome: '/nonexistent', headshotDir: '/nonexistent', pollIntervalMs: 60_000, now: () => T, allowedOrigins: origins, ...deps });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  origins.add(base);
  return { app, base };
}

const json = { 'content-type': 'application/json' };
const bearer = (token: string) => ({ ...json, authorization: `Bearer ${token}` });
const post = (base: string, p: string, body: unknown, headers: Record<string, string>) =>
  fetch(`${base}${p}`, { method: 'POST', headers, body: JSON.stringify(body) });
const hookBody = { session_id: 's-1', cwd: '/home/dev/paper-site', hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/home/dev/paper-site/a.ts' } };

describe('a signed-in, read-only server with the webhook and claude-code adapters', () => {
  let server: { app: App; base: string };
  let cookie = '';
  beforeAll(async () => {
    server = await start({
      adapters: [hermes(), createWebhookAdapter({ token: INGEST, maxEventsPerMinute: 3 }), createClaudeCodeAdapter({ token: INGEST })],
      accessToken: ACCESS,
    });
    const login = await fetch(`${server.base}/login`, {
      method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: server.base },
      body: new URLSearchParams({ token: ACCESS, next: '/' }).toString(),
    });
    cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    expect(cookie).toMatch(/=/);
  });
  afterAll(() => server.app.close());

  it('takes events with the ingest token and no session cookie, even though writes are off', async () => {
    expect((await post(server.base, '/api/ingest/deploy-bot', { type: 'status', status: 'needs-input', activity: 'Approve?' }, bearer(INGEST))).status).toBe(204);
    expect((await post(server.base, '/api/hooks/claude-code', hookBody, bearer(INGEST))).status).toBe(204);
  });

  it('still wants the ingest token: no bearer, the access token, or a session cookie alone get 401', async () => {
    const body = { type: 'activity', text: 'x' };
    for (const headers of [json, bearer(ACCESS), { ...json, cookie }, bearer('')]) {
      const res = await post(server.base, '/api/ingest/deploy-bot', body, headers);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Missing or wrong bearer token' });
    }
    expect((await post(server.base, '/api/hooks/claude-code', hookBody, { ...json, cookie })).status).toBe(401);
  });

  it('keeps the per-agent rate limit', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) statuses.push((await post(server.base, '/api/ingest/chatty', { type: 'activity', text: `${i}` }, bearer(INGEST))).status);
    expect(statuses).toEqual([204, 204, 204, 429]);
  });

  it('does not open anything else: the API still needs a session, and the ingest token is no session', async () => {
    expect((await fetch(`${server.base}/api/office`)).status).toBe(401);
    expect((await fetch(`${server.base}/api/office`, { headers: { authorization: `Bearer ${INGEST}` } })).status).toBe(401);
    expect((await fetch(`${server.base}/api/ingest/deploy-bot`, { headers: { cookie } })).status).toBe(405);
  });

  it('shows the reported agents to a signed-in browser, with both kinds of capabilities', async () => {
    const snap = await (await fetch(`${server.base}/api/office`, { headers: { cookie } })).json() as OfficeSnapshot;
    expect(snap.capabilities).toEqual({ writes: false });
    expect(snap.presence['temp-webhook-deploy-bot']).toMatchObject({ status: 'needs-input', activity: 'Approve?' });
    expect(snap.presence['temp-claude-code-paper-site']).toMatchObject({ status: 'working', activity: 'Reading a.ts' });
    expect(snap.people.find((p) => p.id === 'dwight')?.bot?.capabilities).toMatchObject({ chat: true, createTask: true });
    expect(snap.adapters?.map((a) => a.id)).toEqual(['hermes', 'webhook', 'claude-code']);
  });

  it('refuses writes to any agent while read-only, before any adapter runs', async () => {
    const before = runs;
    const chat = await post(server.base, '/api/chat', { roomId: 'dm-campaigns', text: 'hi' }, { ...json, cookie, origin: server.base });
    expect(chat.status).toBe(403);
    expect(await chat.json()).toEqual({ error: READ_ONLY_ERROR });
    expect((await post(server.base, '/api/chat', { roomId: 'webhook-deploy-bot', text: 'hi' }, { ...json, cookie, origin: server.base })).status).toBe(403);
    expect(runs).toBe(before);
  });
});

describe('inbound endpoints of adapters that are not configured', () => {
  it('do not exist, with or without sign-in', async () => {
    for (const accessToken of [null, ACCESS]) {
      const { app, base } = await start({ adapters: [hermes()], accessToken });
      expect((await post(base, '/api/ingest/deploy-bot', { type: 'activity', text: 'x' }, bearer(INGEST))).status).toBe(404);
      expect((await post(base, '/api/hooks/claude-code', hookBody, bearer(INGEST))).status).toBe(404);
      await app.close();
    }
  });

  it('only the configured one answers when the other is absent', async () => {
    const { app, base } = await start({ adapters: [createWebhookAdapter({ token: INGEST })] });
    expect((await post(base, '/api/ingest/ci', { type: 'activity', text: 'x' }, bearer(INGEST))).status).toBe(204);
    expect((await post(base, '/api/hooks/claude-code', hookBody, bearer(INGEST))).status).toBe(404);
    await app.close();
  });
});
