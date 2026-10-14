// In-memory agent state for push adapters (webhook, claude-code; the demo adapter can replay into it too). Every
// event replaces the state with a new immutable value, so snapshots already handed out never change. Memory is
// bounded: a cap on agents, ring buffers for messages and activity, a cap on tasks, and silent agents are forgotten.
import type { BotStatus, Presence } from '../../../../shared/contract.ts';
import type { ActionError, AdapterSnapshot, AgentInfo, AgentMessage, AgentRoom, AgentTask, MessagesPage } from '../types.ts';
import { scrubText } from '../../domain/scrub.ts';
import type { IngestEvent } from './schema.ts';
import { pushRing } from './ring.ts';

export type AgentStoreOptions = {
  readonly adapterId: string;
  readonly defaultRole: string;
  readonly now?: () => number; // epoch ms
  readonly maxAgents?: number;
  readonly staleAfterMs?: number; // working/meeting with no news this long -> idle
  readonly forgetAfterMs?: number; // no news at all this long -> gone from the map
  readonly messagesPerAgent?: number;
  readonly tasksPerAgent?: number;
  readonly activityPerAgent?: number;
};

export type ActivityEntry = { readonly at: string; readonly text: string };

type AgentState = {
  readonly id: string;
  readonly name?: string;
  readonly role?: string;
  readonly status: BotStatus;
  readonly since: number;
  readonly activity?: string;
  readonly roomId?: string;
  readonly lastEventAt: number;
  readonly retireAt?: number;
  readonly seq: number;
  readonly tasks: ReadonlyArray<AgentTask>;
  readonly messages: ReadonlyArray<AgentMessage>;
  readonly log: ReadonlyArray<ActivityEntry>;
};

const DONE_WINDOW_MS = 48 * 3600_000;
const STALE_STATUSES: ReadonlySet<BotStatus> = new Set(['working', 'meeting']);
const iso = (ms: number) => new Date(ms).toISOString();

export function createAgentStore(opts: AgentStoreOptions) {
  const now = opts.now ?? Date.now;
  const cfg = {
    maxAgents: opts.maxAgents ?? 64, staleAfterMs: opts.staleAfterMs ?? 15 * 60_000, forgetAfterMs: opts.forgetAfterMs ?? 24 * 3600_000,
    messages: opts.messagesPerAgent ?? 100, tasks: opts.tasksPerAgent ?? 50, log: opts.activityPerAgent ?? 50,
  };
  let agents: ReadonlyMap<string, AgentState> = new Map();
  let listeners: ReadonlySet<() => void> = new Set();

  const roomIdOf = (agentId: string): string => `${opts.adapterId}-${agentId}`;

  function prune(): void {
    const t = now();
    const alive = [...agents].filter(([, a]) => t - a.lastEventAt <= cfg.forgetAfterMs && (a.retireAt === undefined || t < a.retireAt));
    if (alive.length !== agents.size) agents = new Map(alive);
  }

  function fresh(id: string, at: number): AgentState {
    return { id, status: 'idle', since: at, lastEventAt: now(), seq: 0, tasks: [], messages: [], log: [] };
  }

  function withStatus(a: AgentState, status: BotStatus, at: number, activity: string | undefined, roomId: string | undefined): AgentState {
    const { activity: _a, roomId: _r, ...rest } = a;
    return {
      ...rest, status, since: status === a.status ? a.since : at,
      ...(activity === undefined ? {} : { activity: scrubText(activity) }),
      ...(status === 'meeting' && roomId ? { roomId } : {}),
    };
  }

  function upsertTask(a: AgentState, e: Extract<IngestEvent, { type: 'task' }>): AgentState {
    const id = `${opts.adapterId}:${a.id}:${e.id}`;
    const task: AgentTask = {
      id, title: scrubText(e.title), status: e.status, ownerAgentId: a.id, ...(e.room ? { roomId: e.room } : {}),
      shared: e.shared ?? false, updatedAt: iso(e.at),
    };
    const tasks = [task, ...a.tasks.filter((t) => t.id !== id)].sort((x, y) => (x.updatedAt < y.updatedAt ? 1 : x.updatedAt > y.updatedAt ? -1 : 0));
    return { ...a, tasks: tasks.slice(0, cfg.tasks) };
  }

  function addMessage(a: AgentState, e: Extract<IngestEvent, { type: 'message' }>): AgentState {
    const seq = a.seq + 1;
    const message: AgentMessage = { id: `${roomIdOf(a.id)}-${seq}`, roomId: roomIdOf(a.id), authorAgentId: a.id, text: scrubText(e.text), at: iso(e.at) };
    return { ...a, seq, messages: pushRing(a.messages, message, cfg.messages) };
  }

  function reduce(a: AgentState, e: IngestEvent): AgentState {
    const { retireAt: _retired, ...alive } = a; // any news cancels a pending retirement
    const named: AgentState = {
      ...alive, lastEventAt: now(), ...(e.name ? { name: scrubText(e.name) } : {}), ...(e.role ? { role: scrubText(e.role) } : {}),
    };
    switch (e.type) {
      case 'status':
        return withStatus(named, e.status, e.at, e.activity, e.room);
      case 'activity':
        return { ...withStatus(named, 'working', e.at, e.text, undefined), log: pushRing(a.log, { at: iso(e.at), text: scrubText(e.text) }, cfg.log) };
      case 'task':
        return upsertTask(named, e);
      case 'message':
        return addMessage(named, e);
      case 'approval':
      case 'approval-withdrawn':
      case 'controls':
        return named; // news from the agent; requests and control callbacks live in the webhook adapter
    }
  }

  function apply(agentId: string, event: IngestEvent): { ok: true } | ActionError {
    prune();
    const current = agents.get(agentId);
    if (!current && agents.size >= cfg.maxAgents) return { ok: false, status: 429, error: `Already tracking ${cfg.maxAgents} agents` };
    agents = new Map([...agents, [agentId, reduce(current ?? fresh(agentId, event.at), event)]]);
    for (const listener of listeners) listener();
    return { ok: true };
  }

  function presenceOf(a: AgentState, t: number): Presence {
    if (STALE_STATUSES.has(a.status) && t - a.lastEventAt > cfg.staleAfterMs) return { status: 'idle', since: iso(a.lastEventAt) };
    return { status: a.status, ...(a.activity ? { activity: a.activity } : {}), since: iso(a.since), ...(a.roomId ? { roomId: a.roomId } : {}) };
  }

  function snapshot(): AdapterSnapshot {
    prune();
    const t = now();
    const list = [...agents.values()];
    const info = (a: AgentState): AgentInfo => ({ id: a.id, ...(a.name ? { name: a.name } : {}), role: a.role ?? opts.defaultRole });
    const room = (a: AgentState): AgentRoom => ({ id: roomIdOf(a.id), name: 'Direct line', kind: 'dm', memberAgentIds: [a.id] });
    const tasks = list.flatMap((a) => a.tasks)
      .filter((task) => task.status !== 'done' || t - Date.parse(task.updatedAt) <= DONE_WINDOW_MS)
      .sort((x, y) => (x.updatedAt < y.updatedAt ? 1 : x.updatedAt > y.updatedAt ? -1 : 0));
    return {
      agents: list.map(info),
      presence: Object.fromEntries(list.map((a) => [a.id, presenceOf(a, t)])),
      tasks,
      rooms: list.map(room),
    };
  }

  function readMessages(roomId: string, limit: number): MessagesPage | null {
    prune();
    const agent = [...agents.values()].find((a) => roomIdOf(a.id) === roomId);
    return agent ? { messages: agent.messages.slice(-Math.max(0, limit)) } : null;
  }

  function retire(agentId: string, afterMs: number): void {
    const a = agents.get(agentId);
    if (a) agents = new Map([...agents, [agentId, { ...a, retireAt: now() + afterMs }]]);
  }

  function subscribe(listener: () => void): () => void {
    listeners = new Set([...listeners, listener]);
    return () => { listeners = new Set([...listeners].filter((l) => l !== listener)); };
  }

  const has = (agentId: string): boolean => (prune(), agents.has(agentId));
  const activityOf = (agentId: string): ReadonlyArray<ActivityEntry> => agents.get(agentId)?.log ?? [];

  return { apply, snapshot, readMessages, retire, subscribe, has, roomIdOf, activityOf, agentIds: () => (prune(), [...agents.keys()]) };
}

export type AgentStore = ReturnType<typeof createAgentStore>;
