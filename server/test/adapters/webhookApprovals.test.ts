// Webhook agents ask with an `approval` event; with a callback URL the office POSTs the decision back, signed with
// HMAC-SHA256 of the ingest token (the token itself never leaves the server). Without one, the item is shown only.
import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { createWebhookAdapter } from '../../src/adapters/webhook.ts';
import type { CallbackPost } from '../../src/adapters/ingest/callback.ts';
import type { AgentAdapter } from '../../src/adapters/types.ts';
import { answerNow } from './contractSuite.ts';

const TOKEN = 'webhook-approvals-token-0123456789';
const T0 = Date.parse('2026-10-13T15:00:00.000Z');
const CALLBACK = 'https://deploy.example.com/dmos/decision';
const post = (a: AgentAdapter, agentId: string, body: unknown) => answerNow(a.routes![0]!.handle({ params: [agentId], body }));
const ask = (extra: Record<string, unknown> = {}) => ({ type: 'approval', id: 'deploy-42', title: 'Deploy v1.2 to production?', detail: 'Migrations: 3', risk: 'high', callback: CALLBACK, ...extra });

type Sent = { url: string; headers: Record<string, string>; body: string };
function setup(reply: (sent: Sent) => Promise<{ ok: boolean; status: number }> = async () => ({ ok: true, status: 204 }), extra: { forgetAfterMs?: number } = {}) {
  let t = T0;
  const sent: Sent[] = [];
  const fake: CallbackPost = async (url, init) => {
    const s = { url, headers: init.headers, body: init.body };
    sent.push(s);
    return reply(s);
  };
  const adapter = createWebhookAdapter({ token: TOKEN, now: () => t, post: fake, callbackTimeoutMs: 50, store: extra });
  return { adapter, sent, tick: (ms: number) => { t += ms; } };
}

describe('webhook approvals', () => {
  it('lists an approval request (never its callback URL) and declares the capability', async () => {
    const { adapter } = setup();
    expect(post(adapter, 'deploy-bot', ask())).toEqual({ status: 204 });
    post(adapter, 'nightly', { type: 'approval', id: 'q1', title: 'Which region?', kind: 'question' });
    expect(adapter.capabilities.approvals).toBe(true);
    const listed = await adapter.listApprovals!();
    expect(listed).toEqual([
      { id: 'deploy-bot.deploy-42', agentId: 'deploy-bot', kind: 'permission', title: 'Deploy v1.2 to production?', detail: 'Migrations: 3',
        requestedAt: new Date(T0).toISOString(), risk: 'high', decidable: true, actions: { approve: 'Tell the agent: approve', reject: 'Tell the agent: reject, with your note' } },
      { id: 'nightly.q1', agentId: 'nightly', kind: 'question', title: 'Which region?', requestedAt: new Date(T0).toISOString(), risk: 'medium', decidable: false },
    ]);
    expect((await adapter.snapshot()).approvals).toEqual(listed);
    expect(JSON.stringify(await adapter.snapshot())).not.toContain('deploy.example.com');
  });

  it('POSTs the decision to the callback, signed, and drops the request once the agent took it', async () => {
    const { adapter, sent } = setup();
    post(adapter, 'deploy-bot', ask());
    expect(await adapter.resolveApproval!('deploy-bot.deploy-42', { approve: false, note: 'not on a Friday' })).toEqual({ ok: true, value: null });
    expect(sent).toHaveLength(1);
    const [s] = sent;
    expect(s!.url).toBe(CALLBACK);
    expect(JSON.parse(s!.body)).toEqual({ type: 'approval-decision', id: 'deploy-42', agent: 'deploy-bot', decision: 'reject', note: 'not on a Friday', decidedAt: new Date(T0).toISOString() });
    const ts = s!.headers['X-DMOS-Timestamp'];
    expect(ts).toBe(String(T0 / 1000));
    expect(s!.headers['X-DMOS-Signature']).toBe(`sha256=${createHmac('sha256', TOKEN).update(`${ts}.${s!.body}`).digest('hex')}`);
    expect(JSON.stringify(s!.headers)).not.toContain(TOKEN);
    expect(await adapter.listApprovals!()).toEqual([]);
  });

  it('keeps the request when the callback fails, and says why', async () => {
    const down = setup(async () => ({ ok: false, status: 500 }));
    post(down.adapter, 'deploy-bot', ask());
    expect(await down.adapter.resolveApproval!('deploy-bot.deploy-42', { approve: true })).toEqual({ ok: false, status: 502, error: "The agent's callback answered 500" });
    expect(await down.adapter.listApprovals!()).toHaveLength(1);
    const unreachable = setup(async () => { throw new Error('ECONNREFUSED 10.0.0.5'); });
    post(unreachable.adapter, 'deploy-bot', ask());
    expect(await unreachable.adapter.resolveApproval!('deploy-bot.deploy-42', { approve: true })).toEqual({ ok: false, status: 502, error: "Could not reach the agent's callback" });
    const slow = setup(() => new Promise(() => undefined));
    post(slow.adapter, 'deploy-bot', ask());
    expect(await slow.adapter.resolveApproval!('deploy-bot.deploy-42', { approve: true })).toMatchObject({ ok: false, status: 504 });
  });

  it('refuses shown-only and unknown requests without calling anyone', async () => {
    const { adapter, sent } = setup();
    post(adapter, 'nightly', { type: 'approval', id: 'q1', title: 'Which region?' });
    expect(await adapter.resolveApproval!('nightly.q1', { approve: true })).toMatchObject({ ok: false, status: 409 });
    expect(await adapter.resolveApproval!('nightly.nope', { approve: true })).toMatchObject({ ok: false, status: 404 });
    expect(sent).toEqual([]);
  });

  it('replaces a request sent again, drops it when withdrawn, and forgets it with its agent', async () => {
    const { adapter, tick } = setup(undefined, { forgetAfterMs: 60_000 });
    post(adapter, 'deploy-bot', ask());
    post(adapter, 'deploy-bot', ask({ title: 'Deploy v1.3 instead?' }));
    expect((await adapter.listApprovals!()).map((a) => a.title)).toEqual(['Deploy v1.3 instead?']);
    post(adapter, 'deploy-bot', { type: 'approval-withdrawn', id: 'deploy-42' });
    expect(await adapter.listApprovals!()).toEqual([]);
    post(adapter, 'deploy-bot', ask());
    tick(61_000);
    expect(await adapter.listApprovals!()).toEqual([]);
  });

  it('holds at most 20 pending requests per agent', () => {
    const { adapter } = setup();
    const codes = Array.from({ length: 21 }, (_, i) => post(adapter, 'chatty', { type: 'approval', id: `a${i}`, title: 'x' }).status);
    expect(codes.slice(0, 20).every((c) => c === 204)).toBe(true);
    expect(codes[20]).toBe(429);
  });
});
