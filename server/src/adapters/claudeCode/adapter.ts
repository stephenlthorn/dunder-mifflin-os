// The `claude-code` adapter: each Claude Code session is a character. Claude Code's http hooks POST every event to
// POST /api/hooks/claude-code (Authorization: Bearer $DMOS_INGEST_TOKEN); hookMap.ts turns them into statuses:
// working while tools run, needs-input on a permission request, idle on Stop, offline on SessionEnd. What a session
// asks you (permission requests, questions) goes to the approvals inbox (pending.ts). The endpoint answers 204 with no
// decision, so Claude Code carries on as it would without it, EXCEPT with `decisions` on (config `decide: true` and
// DMOS_ALLOW_WRITES): then a PermissionRequest is held until you allow or deny it in the office, for up to `holdMs`.
// Agent ids come from the project folder ('paper-site'; a second concurrent session there is 'paper-site-2'), so
// `seats: { jim: { adapter: claude-code, agent: paper-site } }` puts that project's session at Jim's desk.
// The hooks are also the session's timeline (hookTimeline.ts). Hooks carry no token counts, so there is no usage().
// Stop (control verbs): the answer to the session's next PreToolUse/PostToolUse hook is {"continue": false,
// "stopReason": …}, which the hooks protocol documents as ending Claude's turn. No pause: hooks cannot hold or resume.
import type { ActionError, AgentAdapter, ControlResult, InboundResponse, InboundRoute } from '../types.ts';
import { NO_CAPABILITIES } from '../types.ts';
import { bearerAuthorizer } from '../ingest/auth.ts';
import { createKeyedLimiter } from '../ingest/keyedLimiter.ts';
import { createAgentStore, type AgentStoreOptions } from '../ingest/store.ts';
import { hookEffect, isAsking, parseHook, projectSlug, type Hook } from './hookMap.ts';
import { createPending, type Asked } from './pending.ts';
import { permissionRisk, permissionTitle } from './permission.ts';
import { timelineOfHook } from './hookTimeline.ts';
import { createTimelineLog } from '../ingest/timelineLog.ts';

export const CLAUDE_CODE_BODY_LIMIT = 1024 * 1024; // PostToolUse carries the tool's output; we read only a few fields

export type ClaudeCodeAdapterOptions = {
  readonly id?: string;
  readonly token: string; // DMOS_INGEST_TOKEN, already validated
  readonly now?: () => number; // epoch ms
  readonly maxEventsPerMinute?: number; // per session
  readonly endedGraceMs?: number; // how long an ended session stays on the map (offline)
  readonly decisions?: boolean; // hold PermissionRequests for a decision in the office (config decide + writes on)
  readonly holdMs?: number; // how long to hold one before Claude Code asks in the terminal
  readonly store?: Omit<AgentStoreOptions, 'adapterId' | 'defaultRole' | 'now'>;
};

type Session = { readonly agentId: string; readonly activity?: string };

export const DEFAULT_HOLD_MS = 120_000;
/** A stop waits this long for the session's next tool hook, then lapses (it must not end a later, unrelated turn). */
export const STOP_TTL_MS = 120_000;
export const STOP_REASON = 'Stopped from Dunder Mifflin OS';
const STOPS_ON: ReadonlySet<string> = new Set(['PreToolUse', 'PostToolUse']); // hook events documented to honour continue: false
const STOPPABLE: ReadonlySet<string> = new Set(['working', 'needs-input']);

function askedOf(hook: Hook, agentId: string): Asked {
  if (hook.event === 'PermissionRequest') {
    const title = permissionTitle(hook.tool, hook.detail);
    return { agentId, kind: 'permission', title, ...(hook.ask ? { detail: hook.ask } : {}), risk: hook.tool ? permissionRisk(hook.tool) : 'medium' };
  }
  const permission = hook.notification === 'permission_prompt';
  const title = permission ? 'Needs your permission' : 'Has a question for you';
  return { agentId, kind: permission ? 'permission' : 'question', title, ...(hook.message ? { detail: hook.message } : {}), risk: 'medium' };
}

export function hooksPath(adapterId: string): RegExp {
  return new RegExp(`^\\/api\\/hooks\\/${adapterId}$`);
}

export function createClaudeCodeAdapter(opts: ClaudeCodeAdapterOptions): AgentAdapter {
  const id = opts.id ?? 'claude-code';
  const now = opts.now ?? Date.now;
  const store = createAgentStore({ forgetAfterMs: 6 * 3600_000, ...opts.store, adapterId: id, defaultRole: 'Claude Code session', now });
  const limiter = createKeyedLimiter({ max: opts.maxEventsPerMinute ?? 600, windowMs: 60_000, clock: now });
  const graceMs = opts.endedGraceMs ?? 5 * 60_000;
  const timeline = createTimelineLog({ isAlive: (agentId) => store.has(agentId) });
  let sessions: ReadonlyMap<string, Session> = new Map();
  let stops: ReadonlyMap<string, number> = new Map(); // session id -> stop request expiry (epoch ms)
  let listeners: ReadonlySet<() => void> = new Set();
  const pending = createPending({ now, holdMs: opts.holdMs ?? DEFAULT_HOLD_MS, onChange: () => { for (const l of listeners) l(); } });

  function pruneSessions(): void {
    const live = [...sessions].filter(([, s]) => store.has(s.agentId));
    if (live.length !== sessions.size) sessions = new Map(live);
  }

  /** The project's slug, or slug-2, slug-3, ... while another live session holds it. */
  function allocate(project: string): string {
    const taken = new Set([...sessions.values()].map((s) => s.agentId));
    const base = projectSlug(project);
    let n = 1;
    while (taken.has(n === 1 ? base : `${base}-${n}`)) n += 1;
    return n === 1 ? base : `${base}-${n}`;
  }

  function receive(hook: Hook): ActionError | null {
    pruneSessions();
    if (!isAsking(hook)) pending.clearSession(hook.sessionId); // the session moved on: whatever it asked is settled
    const known = sessions.get(hook.sessionId);
    const effect = hookEffect(hook, known?.activity);
    if (!effect.status && !effect.message) return null;
    const agentId = known?.agentId ?? allocate(hook.project);
    const at = now();
    if (effect.status) {
      const { status, activity } = effect.status;
      const applied = store.apply(agentId, { type: 'status', status, ...(activity ? { activity } : {}), name: hook.project, at });
      if (!applied.ok) return applied;
    }
    if (effect.message) store.apply(agentId, { type: 'message', text: effect.message, at });
    const event = timelineOfHook(hook, at, 'claude-code');
    if (event) timeline.add(agentId, event);
    if (effect.ended) store.retire(agentId, graceMs);
    const activity = effect.status ? effect.status.activity : known?.activity;
    sessions = new Map([...sessions, [hook.sessionId, activity ? { agentId, activity } : { agentId }]]);
    return null;
  }

  /** A PermissionRequest is held (decisions on) or shown; an asking notification is shown. Everything else: 204. */
  function ask(hook: Hook, signal?: AbortSignal): InboundResponse | Promise<InboundResponse> {
    const agentId = sessions.get(hook.sessionId)?.agentId;
    if (!agentId || !isAsking(hook)) return { status: 204 };
    if (hook.event === 'PermissionRequest' && opts.decisions) return pending.hold(hook.sessionId, askedOf(hook, agentId), signal);
    if (hook.event === 'PermissionRequest') pending.clearSession(hook.sessionId);
    if (!pending.hasHeld(hook.sessionId)) pending.show(hook.sessionId, askedOf(hook, agentId));
    return { status: 204 };
  }

  /** The session asked to stop answers its next tool hook with continue: false (once). */
  function stopAnswer(hook: Hook, agentId: string | undefined): InboundResponse | null {
    const until = stops.get(hook.sessionId);
    if (until === undefined || !STOPS_ON.has(hook.event)) return null;
    stops = new Map([...stops].filter(([id]) => id !== hook.sessionId));
    if (now() > until || !agentId) return null;
    const at = now();
    store.apply(agentId, { type: 'status', status: 'idle', activity: 'Stopped from the office', at });
    timeline.add(agentId, { at: new Date(at).toISOString(), kind: 'status', title: 'Stopped from the office', source: 'office' });
    return { status: 200, body: { continue: false, stopReason: STOP_REASON } };
  }

  async function stop(agentId: string): Promise<ControlResult> {
    pruneSessions();
    const status = store.snapshot().presence[agentId]?.status;
    const ids = [...sessions].filter(([, s]) => s.agentId === agentId).map(([id]) => id);
    if (!ids.length || !status || !STOPPABLE.has(status)) return { ok: false, status: 409, error: 'Nothing to stop: that session is not working' };
    const until = now() + STOP_TTL_MS;
    stops = new Map([...stops, ...ids.map((id) => [id, until] as const)]);
    return { ok: true, value: { note: 'Claude Code stops at its next tool step (hooks cannot cut a reply short).' } };
  }

  const route: InboundRoute = {
    pattern: hooksPath(id),
    maxBodyBytes: CLAUDE_CODE_BODY_LIMIT,
    authorize: bearerAuthorizer(opts.token),
    handle: ({ body, signal }) => {
      const parsed = parseHook(body);
      if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
      if (!limiter.take(parsed.hook.sessionId)) return { status: 429, body: { error: 'Too many hook events from this session' }, headers: { 'Retry-After': '60' } };
      const refused = receive(parsed.hook);
      if (refused) return { status: refused.status, body: { error: refused.error } };
      return stopAnswer(parsed.hook, sessions.get(parsed.hook.sessionId)?.agentId) ?? ask(parsed.hook, signal);
    },
  };

  return {
    id,
    kind: 'claude-code',
    label: 'Claude Code',
    capabilities: { ...NO_CAPABILITIES, approvals: true, stop: true },
    snapshot: async () => ({ ...store.snapshot(), approvals: pending.list() }),
    subscribe: (listener) => {
      const off = store.subscribe(listener);
      listeners = new Set([...listeners, listener]);
      return () => { off(); listeners = new Set([...listeners].filter((l) => l !== listener)); };
    },
    readMessages: async (roomId, limit) => store.readMessages(roomId, limit),
    timeline: async (agentId, query) => timeline.read(agentId, query),
    listApprovals: async () => pending.list(),
    resolveApproval: async (id, decision) => {
      const decided = pending.decide(id, decision);
      if (!decided.ok) return decided;
      const activity = `${decision.approve ? 'Allowed' : 'Denied'}: ${decided.value.title}`;
      store.apply(decided.value.agentId, { type: 'status', status: 'working', activity, at: now() });
      return { ok: true, value: null };
    },
    stop: (agentId) => stop(agentId),
    routes: [route],
    close: async () => pending.close(),
  };
}
