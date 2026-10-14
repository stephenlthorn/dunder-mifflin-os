// The `webhook` adapter: "if it can POST, it can sit at a desk". Agents POST one JSON event at a time
// (status, activity, task, message; see ingest/schema.ts and docs/adapters/webhook.md) to
// POST /api/ingest/:agentId with `Authorization: Bearer $DMOS_INGEST_TOKEN`. Events are validated, rate-limited per
// agent and kept in memory only (ingest/store.ts). The office can't chat or give tasks; it answers `approval` events
// by POSTing the decision to the callback URL the agent gave (ingest/callback.ts; no callback = shown only), and
// sends pause / resume / stop as signed `control` events to the callback an agent offered in a `controls` event.
// The events posted are the agent's timeline (ingest/timelineLog.ts); webhook agents report no token usage.
import type { AgentAdapter, ControlResult, InboundRoute } from './types.ts';
import { NO_CAPABILITIES } from './types.ts';
import { createApprovalBox } from './ingest/approvalBox.ts';
import { type CallbackPost, type ControlEventAction, DEFAULT_CALLBACK_TIMEOUT_MS, fetchPost, sendControl, sendDecision } from './ingest/callback.ts';
import { createControlBox } from './ingest/controlBox.ts';
import { bearerAuthorizer } from './ingest/auth.ts';
import { createKeyedLimiter } from './ingest/keyedLimiter.ts';
import { type ControlVerb, parseIngestEvent } from './ingest/schema.ts';
import { createAgentStore, type AgentStoreOptions } from './ingest/store.ts';
import { timelineOfIngest } from './ingest/ingestTimeline.ts';
import { createTimelineLog } from './ingest/timelineLog.ts';

/** Webhook agent ids: lower-case letters, digits and dashes, at most 28 characters (room ids add the adapter id). */
export const WEBHOOK_AGENT_ID = /^[a-z0-9][a-z0-9-]{0,27}$/;
export const WEBHOOK_BODY_LIMIT = 16 * 1024;

export type WebhookAdapterOptions = {
  readonly id?: string;
  readonly token: string; // DMOS_INGEST_TOKEN, already validated (ingest/auth.ts readIngestToken)
  readonly now?: () => number; // epoch ms
  readonly maxEventsPerMinute?: number; // per agent
  readonly post?: CallbackPost; // how decisions reach callbacks (default: fetch)
  readonly callbackTimeoutMs?: number;
  readonly store?: Omit<AgentStoreOptions, 'adapterId' | 'defaultRole' | 'now'>;
};

function decode(raw: string | undefined): string {
  try {
    return decodeURIComponent(raw ?? '');
  } catch {
    return '';
  }
}

export function ingestPath(adapterId: string): RegExp {
  return adapterId === 'webhook' ? /^\/api\/ingest\/([^/]+)$/ : new RegExp(`^\\/api\\/ingest\\/${adapterId}\\/([^/]+)$`);
}

export function createWebhookAdapter(opts: WebhookAdapterOptions): AgentAdapter {
  const id = opts.id ?? 'webhook';
  const now = opts.now ?? Date.now;
  const store = createAgentStore({ ...opts.store, adapterId: id, defaultRole: 'Webhook agent', now });
  const limiter = createKeyedLimiter({ max: opts.maxEventsPerMinute ?? 120, windowMs: 60_000, clock: now });
  const timeline = createTimelineLog({ isAlive: (agentId) => store.has(agentId) });
  const box = createApprovalBox();
  const callback = { post: opts.post ?? fetchPost, token: opts.token, now, timeoutMs: opts.callbackTimeoutMs ?? DEFAULT_CALLBACK_TIMEOUT_MS };
  const pending = () => box.list((agentId) => store.has(agentId));
  const controls = createControlBox();
  const AFTER: Readonly<Record<ControlEventAction, { status: 'offline' | 'idle'; activity: string }>> = {
    pause: { status: 'offline', activity: 'Paused from the office' }, // a paused bot goes home
    resume: { status: 'idle', activity: 'Resumed from the office' },
    stop: { status: 'idle', activity: 'Stopped from the office' },
  };

  /** Send a control verb to the agent's callback; on success show it on the map and the timeline until it reports again. */
  const control = (verb: ControlVerb, action: ControlEventAction) => async (agentId: string): Promise<ControlResult> => {
    controls.prune((id) => store.has(id));
    const url = controls.callbackFor(agentId, verb);
    if (!url) return { ok: false, status: 409, error: `This agent gave no control callback for ${verb}` };
    const sent = await sendControl(callback, { callback: url, agentId }, action);
    if (!sent.ok) return sent;
    const at = now();
    store.apply(agentId, { type: 'status', status: AFTER[action].status, activity: AFTER[action].activity, at });
    timeline.add(agentId, { at: new Date(at).toISOString(), kind: 'status', title: AFTER[action].activity, source: 'office' });
    return { ok: true, value: null };
  };

  const route: InboundRoute = {
    pattern: ingestPath(id),
    maxBodyBytes: WEBHOOK_BODY_LIMIT,
    authorize: bearerAuthorizer(opts.token),
    handle: ({ params, body }) => {
      const agentId = decode(params[0]);
      if (!WEBHOOK_AGENT_ID.test(agentId)) {
        return { status: 400, body: { error: 'agent id must be 1-28 lower-case letters, digits or dashes' } };
      }
      if (!limiter.take(agentId)) return { status: 429, body: { error: 'Too many events from this agent; slow down' }, headers: { 'Retry-After': '60' } };
      const parsed = parseIngestEvent(body, now());
      if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
      const event = parsed.event;
      if (event.type === 'approval') {
        const put = box.put(agentId, event);
        if (!put.ok) return { status: put.status, body: { error: put.error } };
      }
      if (event.type === 'approval-withdrawn') box.withdraw(agentId, event.id);
      if (event.type === 'controls') controls.put(agentId, event);
      const applied = store.apply(agentId, event);
      if (!applied.ok) return { status: applied.status, body: { error: applied.error } };
      timeline.add(agentId, timelineOfIngest(event, 'webhook'));
      return { status: 204 };
    },
  };

  return {
    id,
    kind: 'webhook',
    label: 'Webhook',
    capabilities: { ...NO_CAPABILITIES, approvals: true, pause: true, stop: true },
    snapshot: async () => {
      const snap = store.snapshot();
      controls.prune((id) => store.has(id));
      return { ...snap, approvals: pending(), capabilities: Object.fromEntries(snap.agents.map((a) => [a.id, controls.offFor(a.id)])) };
    },
    subscribe: (listener) => store.subscribe(listener),
    readMessages: async (roomId, limit) => store.readMessages(roomId, limit),
    timeline: async (agentId, query) => timeline.read(agentId, query),
    listApprovals: async () => pending(),
    resolveApproval: async (id, decision) => {
      pending(); // forget requests of agents that left
      const entry = box.get(id);
      if (!entry) return { ok: false, status: 404, error: 'No such request (answered or withdrawn)' };
      if (!entry.callback) return { ok: false, status: 409, error: 'This agent gave no callback; answer it where it runs' };
      const sent = await sendDecision(callback, { callback: entry.callback, agentId: entry.agentId, requestId: entry.requestId }, decision);
      if (sent.ok) box.remove(id);
      return sent;
    },
    pause: control('pause', 'pause'),
    resume: control('pause', 'resume'),
    stop: control('stop', 'stop'),
    routes: [route],
  };
}
