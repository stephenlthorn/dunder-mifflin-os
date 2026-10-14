// Webhook agents opt in to control verbs with a `controls` event (a callback URL and the verbs they take). Pause,
// resume and stop are then POSTed to that callback as `control` events, signed like decisions (HMAC-SHA256 of the
// ingest token over "<timestamp>.<body>"). An agent that never sent `controls` can't be paused or stopped.
import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { createWebhookAdapter } from '../../src/adapters/webhook.ts';
import type { CallbackPost } from '../../src/adapters/ingest/callback.ts';
import type { AgentAdapter } from '../../src/adapters/types.ts';
import { answerNow } from './contractSuite.ts';

const TOKEN = 'webhook-controls-token-0123456789';
const T0 = Date.parse('2026-10-13T15:00:00.000Z');
const CALLBACK = 'https://deploy.example.com/dmos/control';
const post = (a: AgentAdapter, agentId: string, body: unknown) => answerNow(a.routes![0]!.handle({ params: [agentId], body }));

type Sent = { url: string; headers: Record<string, string>; body: string };
function setup(reply: () => Promise<{ ok: boolean; status: number }> = async () => ({ ok: true, status: 204 })) {
  const sent: Sent[] = [];
  const fake: CallbackPost = async (url, init) => {
    sent.push({ url, headers: init.headers, body: init.body });
    return reply();
  };
  const adapter = createWebhookAdapter({ token: TOKEN, now: () => T0, post: fake, callbackTimeoutMs: 50 });
  return { adapter, sent };
}

describe('webhook control verbs', () => {
  it('declares pause and stop (no jobs, no reassign)', () => {
    expect(setup().adapter.capabilities).toEqual({ chat: false, createTask: false, approvals: true, pause: true, stop: true, runJob: false, reassign: false });
  });

  it('turns the verbs off for an agent until it offers them, and never shows the callback', async () => {
    const { adapter } = setup();
    post(adapter, 'deploy-bot', { type: 'status', status: 'working' });
    expect((await adapter.snapshot()).capabilities).toEqual({ 'deploy-bot': { pause: false, stop: false } });
    expect(post(adapter, 'deploy-bot', { type: 'controls', callback: CALLBACK, verbs: ['stop'] })).toEqual({ status: 204 });
    expect((await adapter.snapshot()).capabilities).toEqual({ 'deploy-bot': { pause: false } });
    post(adapter, 'deploy-bot', { type: 'controls', callback: CALLBACK, verbs: ['pause', 'stop'] });
    expect((await adapter.snapshot()).capabilities).toEqual({ 'deploy-bot': {} });
    expect(JSON.stringify(await adapter.snapshot())).not.toContain('deploy.example.com');
  });

  it('validates the controls event', () => {
    const { adapter } = setup();
    for (const [body, error] of [
      [{ type: 'controls', verbs: ['pause'] }, /callback/],
      [{ type: 'controls', callback: 'http://evil.example.com/x', verbs: ['pause'] }, /callback/],
      [{ type: 'controls', callback: CALLBACK, verbs: ['explode'] }, /verbs/],
      [{ type: 'controls', callback: CALLBACK, verbs: 'pause' }, /verbs/],
      [{ type: 'controls', callback: CALLBACK, verbs: ['stop', 'stop'] }, /verbs/],
      [{ type: 'controls', callback: CALLBACK }, /verbs/],
    ] as const) {
      expect(post(adapter, 'deploy-bot', body)).toMatchObject({ status: 400, body: { error: expect.stringMatching(error) } });
    }
    expect(post(adapter, 'deploy-bot', { type: 'controls', verbs: [] })).toEqual({ status: 204 }); // withdraws them
  });

  it('POSTs a signed control event to the callback, and shows the bot paused (gone home) until it says otherwise', async () => {
    const { adapter, sent } = setup();
    post(adapter, 'deploy-bot', { type: 'status', status: 'working', activity: 'Deploying' });
    post(adapter, 'deploy-bot', { type: 'controls', callback: CALLBACK, verbs: ['pause', 'stop'] });
    expect(await adapter.pause!('deploy-bot')).toEqual({ ok: true, value: null });
    expect(sent).toHaveLength(1);
    const [s] = sent;
    expect(s!.url).toBe(CALLBACK);
    const body = JSON.parse(s!.body) as Record<string, unknown>;
    expect(body).toEqual({ type: 'control', id: expect.stringMatching(/^[0-9a-f-]{36}$/), agent: 'deploy-bot', action: 'pause', requestedAt: new Date(T0).toISOString() });
    const ts = s!.headers['X-DMOS-Timestamp']!;
    expect(s!.headers['X-DMOS-Signature']).toBe(`sha256=${createHmac('sha256', TOKEN).update(`${ts}.${s!.body}`).digest('hex')}`);
    expect(s!.body).not.toContain(TOKEN);
    expect((await adapter.snapshot()).presence['deploy-bot']).toMatchObject({ status: 'offline', activity: 'Paused from the office' });
    expect(await adapter.resume!('deploy-bot')).toEqual({ ok: true, value: null });
    expect((await adapter.snapshot()).presence['deploy-bot']).toMatchObject({ status: 'idle', activity: 'Resumed from the office' });
    expect(await adapter.stop!('deploy-bot')).toEqual({ ok: true, value: null });
    expect(sent.map((x) => (JSON.parse(x.body) as { action: string }).action)).toEqual(['pause', 'resume', 'stop']);
    const timeline = await adapter.timeline!('deploy-bot', { since: new Date(T0 - 1000).toISOString(), limit: 10 });
    expect(timeline?.map((e) => e.title)).toEqual(expect.arrayContaining(['Paused from the office', 'Resumed from the office', 'Stopped from the office']));
  });

  it('refuses verbs the agent did not offer, without POSTing', async () => {
    const { adapter, sent } = setup();
    post(adapter, 'quiet-bot', { type: 'status', status: 'idle' });
    expect(await adapter.pause!('quiet-bot')).toEqual({ ok: false, status: 409, error: 'This agent gave no control callback for pause' });
    post(adapter, 'quiet-bot', { type: 'controls', callback: CALLBACK, verbs: ['stop'] });
    expect(await adapter.resume!('quiet-bot')).toEqual({ ok: false, status: 409, error: 'This agent gave no control callback for pause' });
    expect(await adapter.stop!('nobody')).toEqual({ ok: false, status: 409, error: 'This agent gave no control callback for stop' });
    expect(sent).toEqual([]);
  });

  it('reports a callback that refuses or does not answer, and changes nothing', async () => {
    const refusing = setup(async () => ({ ok: false, status: 500 }));
    post(refusing.adapter, 'deploy-bot', { type: 'status', status: 'working' });
    post(refusing.adapter, 'deploy-bot', { type: 'controls', callback: CALLBACK, verbs: ['pause'] });
    expect(await refusing.adapter.pause!('deploy-bot')).toEqual({ ok: false, status: 502, error: "The agent's callback answered 500" });
    expect((await refusing.adapter.snapshot()).presence['deploy-bot']).toMatchObject({ status: 'working' });
    const silent = setup(() => new Promise(() => {}));
    post(silent.adapter, 'deploy-bot', { type: 'controls', callback: CALLBACK, verbs: ['pause'] });
    expect(await silent.adapter.pause!('deploy-bot')).toEqual({ ok: false, status: 504, error: "The agent's callback did not answer in time" });
  });
});
