import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createWebhookAdapter } from '../../src/adapters/webhook.ts';
import type { AgentAdapter, InboundRoute } from '../../src/adapters/types.ts';
import { createApp, type App } from '../../src/http/app.ts';
import type { OfficeSnapshot } from '../../../shared/contract.ts';
import { DIRTY_TEXT, answerNow, describeAdapterContract } from './contractSuite.ts';

const TOKEN = 'test-ingest-token-0123456789abcdef';
const T0 = Date.parse('2026-10-13T15:00:00.000Z');
const routeOf = (a: AgentAdapter): InboundRoute => a.routes![0]!;
const post = (a: AgentAdapter, agentId: string, body: unknown) => answerNow(routeOf(a).handle({ params: [agentId], body }));

describeAdapterContract('webhook', {
  make: async () => {
    let t = T0;
    const adapter = createWebhookAdapter({ token: TOKEN, now: () => t });
    const dirty = DIRTY_TEXT.slice(0, 190);
    post(adapter, 'deploy-bot', { type: 'status', status: 'needs-input', activity: dirty, name: dirty.slice(0, 60), role: dirty.slice(0, 80) });
    post(adapter, 'deploy-bot', { type: 'task', id: 'd-1', title: dirty, status: 'doing' });
    post(adapter, 'deploy-bot', { type: 'message', text: DIRTY_TEXT });
    post(adapter, 'nightly', { type: 'activity', text: 'Reindexing' });
    return {
      adapter, token: TOKEN,
      feedMore: () => {
        t += 1000;
        post(adapter, 'nightly', { type: 'status', status: 'idle', at: new Date(t).toISOString() });
      },
    };
  },
});

describe('webhook ingest endpoint (handler)', () => {
  const adapter = createWebhookAdapter({ token: TOKEN, now: () => T0, maxEventsPerMinute: 3 });

  it('accepts a valid event with 204 and shows the agent', async () => {
    expect(post(adapter, 'ci', { type: 'status', status: 'working', activity: 'Building' })).toEqual({ status: 204 });
    expect((await adapter.snapshot()).presence.ci).toMatchObject({ status: 'working', activity: 'Building' });
  });

  it('refuses a bad agent id or a malformed event with 400 and a reason', () => {
    expect(post(adapter, 'Not_OK', { type: 'activity', text: 'x' })).toMatchObject({ status: 400, body: { error: expect.stringMatching(/agent id/) } });
    expect(post(adapter, 'x'.repeat(29), { type: 'activity', text: 'x' }).status).toBe(400);
    expect(post(adapter, '%E0%A4%A', { type: 'activity', text: 'x' }).status).toBe(400);
    expect(post(adapter, 'ci', { type: 'status', status: 'dancing' })).toMatchObject({ status: 400, body: { error: expect.stringMatching(/status/) } });
  });

  it('rate-limits each agent separately', () => {
    const limited = createWebhookAdapter({ token: TOKEN, now: () => T0, maxEventsPerMinute: 2 });
    expect([1, 2, 3].map(() => post(limited, 'chatty', { type: 'activity', text: 'x' }).status)).toEqual([204, 204, 429]);
    expect(post(limited, 'chatty', { type: 'activity', text: 'x' }).headers).toEqual({ 'Retry-After': '60' });
    expect(post(limited, 'quiet', { type: 'activity', text: 'x' }).status).toBe(204);
  });

  it('declares approvals, pause and stop (via the agent\'s callbacks) but cannot chat or give tasks', () => {
    expect(adapter.capabilities).toEqual({ chat: false, createTask: false, approvals: true, pause: true, stop: true, runJob: false, reassign: false });
  });
});

describe('POST /api/ingest/:agentId over HTTP', () => {
  let app: App;
  let base: string;
  beforeAll(async () => {
    app = createApp({
      adapters: [createWebhookAdapter({ token: TOKEN })], hermesHome: '/nonexistent', headshotDir: '/nonexistent', pollIntervalMs: 60_000,
      allowWrites: true, // so a refused chat shows the adapter's own limit (501), not read-only mode
    });
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });
  afterAll(() => app.close());

  const ingest = (agentId: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${base}/api/ingest/${agentId}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
  });

  it('pushes the change to open event streams straight away (no waiting for the poll)', async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/events`, { signal: ctrl.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const frames = () => text.split('\n\n').filter((f) => f.startsWith('data: '));
    while (frames().length < 1) text += decoder.decode((await reader.read()).value, { stream: true });
    expect((await ingest('pusher', { type: 'status', status: 'needs-input', activity: 'Approve the deploy?' })).status).toBe(204);
    while (frames().length < 2) text += decoder.decode((await reader.read()).value, { stream: true });
    ctrl.abort();
    expect(JSON.parse(frames()[1]!.slice(6)).presence['temp-webhook-pusher']).toMatchObject({ status: 'needs-input', activity: 'Approve the deploy?' });
  });

  it('needs the bearer token', async () => {
    const none = await fetch(`${base}/api/ingest/ci`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"type":"activity","text":"x"}' });
    expect(none.status).toBe(401);
    expect(none.headers.get('www-authenticate')).toBe('Bearer');
    expect((await ingest('ci', { type: 'activity', text: 'x' }, { authorization: 'Bearer nope-nope-nope-nope-nope-nope' })).status).toBe(401);
  });

  it('needs JSON within the size limit, from no foreign web page', async () => {
    expect((await ingest('ci', 'not json')).status).toBe(400);
    expect((await ingest('ci', { type: 'message', text: 'x'.repeat(20_000) })).status).toBe(413);
    expect((await ingest('ci', '{}', { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await ingest('ci', { type: 'activity', text: 'x' }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await fetch(`${base}/api/ingest/ci`)).status).toBe(405);
  });

  it('puts a new agent at a spare desk as a temp, with a read-only direct line', async () => {
    expect((await ingest('deploy-bot', { type: 'status', status: 'working', activity: 'Deploying v1.2', name: 'Deploy Bot' })).status).toBe(204);
    expect((await ingest('deploy-bot', { type: 'message', text: 'Deployed to staging.' })).status).toBe(204);
    const snap = await (await fetch(`${base}/api/office`)).json() as OfficeSnapshot;
    const temp = snap.people.find((p) => p.id === 'temp-webhook-deploy-bot');
    expect(temp).toMatchObject({ name: 'Deploy Bot', title: 'Temp · Webhook', seatId: expect.stringMatching(/^seat\.spare\./), bot: { profile: 'deploy-bot', adapter: 'webhook' } });
    expect(snap.presence['temp-webhook-deploy-bot']).toMatchObject({ status: 'working', activity: 'Deploying v1.2' });
    const room = snap.rooms.find((r) => r.id === 'webhook-deploy-bot');
    expect(room).toMatchObject({ kind: 'dm', name: 'Direct line: Deploy Bot', memberIds: ['temp-webhook-deploy-bot'], capabilities: { chat: false } });
    const messages = await (await fetch(`${base}/api/rooms/webhook-deploy-bot/messages`)).json();
    expect(messages).toEqual([expect.objectContaining({ authorId: 'temp-webhook-deploy-bot', text: 'Deployed to staging.' })]);
    const chat = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roomId: 'webhook-deploy-bot', text: 'hi' }) });
    expect(chat.status).toBe(501);
  });
});
