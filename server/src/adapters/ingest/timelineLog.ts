// In-memory timeline for push adapters (webhook, claude-code): a bounded ring of events per agent, newest last.
// The same event arriving again and again (an agent re-posting its status, Claude reading one file twice) folds
// into the last one with a count. Agents the store has forgotten have no timeline (isAlive). Immutable updates.
import type { TimelineEvent } from '../../../../shared/observability.ts';
import type { TimelineQuery } from '../types.ts';
import { pushRing } from './ring.ts';

export type NewTimelineEvent = Omit<TimelineEvent, 'id'>;

export type TimelineLogOptions = {
  readonly perAgent?: number;
  readonly isAlive: (agentId: string) => boolean;
};

const sameThing = (a: TimelineEvent, b: NewTimelineEvent) =>
  a.kind === b.kind && a.title === b.title && a.detail === b.detail && a.source === b.source;

export function createTimelineLog(opts: TimelineLogOptions) {
  const cap = opts.perAgent ?? 200;
  let logs: ReadonlyMap<string, ReadonlyArray<TimelineEvent>> = new Map();
  let seq = 0;

  function prune(): void {
    const alive = [...logs].filter(([id]) => opts.isAlive(id));
    if (alive.length !== logs.size) logs = new Map(alive);
  }

  function add(agentId: string, event: NewTimelineEvent): void {
    prune();
    const list = logs.get(agentId) ?? [];
    const last = list.at(-1);
    if (last && sameThing(last, event)) {
      const folded: TimelineEvent = { ...last, at: event.at, count: (last.count ?? 1) + 1 };
      logs = new Map([...logs, [agentId, Object.freeze([...list.slice(0, -1), folded])]]);
      return;
    }
    seq += 1;
    logs = new Map([...logs, [agentId, pushRing(list, { id: `${agentId}-e${seq}`, ...event }, cap)]]);
  }

  /** Newest first; null when the agent is unknown (or forgotten). */
  function read(agentId: string, query: TimelineQuery): ReadonlyArray<TimelineEvent> | null {
    prune();
    if (!opts.isAlive(agentId)) return null;
    const since = Date.parse(query.since);
    return [...(logs.get(agentId) ?? [])].reverse().filter((e) => !(Date.parse(e.at) < since)).slice(0, query.limit);
  }

  return { add, read };
}

export type TimelineLog = ReturnType<typeof createTimelineLog>;
