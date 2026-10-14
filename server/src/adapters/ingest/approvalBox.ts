// What webhook agents wait on you for: their `approval` events, kept in memory (immutable map), at most 20 pending per
// agent. The callback URL stays here, server-side; the listed request never carries it. Local ids are
// '<agent id>.<request id>'. A request sent again replaces the old one; `approval-withdrawn` drops it.
import type { ActionError, ApprovalRequest } from '../types.ts';
import { scrubText } from '../../domain/scrub.ts';
import type { IngestEvent } from './schema.ts';

type ApprovalEvent = Extract<IngestEvent, { type: 'approval' }>;
type Entry = { readonly request: ApprovalRequest; readonly agentId: string; readonly requestId: string; readonly callback?: string };

export const ANSWER_ACTIONS = Object.freeze({ approve: 'Tell the agent: approve', reject: 'Tell the agent: reject, with your note' });
const MAX_PER_AGENT = 20;

export function createApprovalBox(opts: { maxPerAgent?: number } = {}) {
  const max = opts.maxPerAgent ?? MAX_PER_AGENT;
  let entries: ReadonlyMap<string, Entry> = new Map();
  const keyOf = (agentId: string, requestId: string) => `${agentId}.${requestId}`;

  function put(agentId: string, e: ApprovalEvent): { ok: true } | ActionError {
    const key = keyOf(agentId, e.id);
    const mine = [...entries.values()].filter((x) => x.agentId === agentId);
    if (!entries.has(key) && mine.length >= max) return { ok: false, status: 429, error: `${max} requests from this agent are already waiting` };
    const request: ApprovalRequest = {
      id: key, agentId, kind: e.kind ?? 'permission', title: scrubText(e.title), ...(e.detail ? { detail: scrubText(e.detail) } : {}),
      requestedAt: new Date(e.at).toISOString(), risk: e.risk ?? 'medium', decidable: Boolean(e.callback), ...(e.callback ? { actions: ANSWER_ACTIONS } : {}),
    };
    entries = new Map([...entries, [key, { request, agentId, requestId: e.id, ...(e.callback ? { callback: e.callback } : {}) }]]);
    return { ok: true };
  }

  function remove(key: string): void {
    if (entries.has(key)) entries = new Map([...entries].filter(([k]) => k !== key));
  }

  const withdraw = (agentId: string, requestId: string): void => remove(keyOf(agentId, requestId));
  /** Requests of agents still on the map (`alive`), oldest first. */
  const list = (alive: (agentId: string) => boolean): ApprovalRequest[] => {
    const gone = [...entries.values()].filter((x) => !alive(x.agentId));
    for (const x of gone) remove(x.request.id);
    return [...entries.values()].map((x) => x.request);
  };
  const get = (key: string): Entry | undefined => entries.get(key);

  return { put, withdraw, list, get, remove };
}
