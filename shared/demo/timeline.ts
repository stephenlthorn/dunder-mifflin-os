// A demo bot's timeline: what it did today up to an office minute, straight from the script (its status changes,
// cards, scheduled job runs and messages) plus the ambient work it picked up. Newest first, ISO office time. Pure;
// the demo adapter serves it as the bot's timeline, so the demo day has a documentary crew (and real Dundies).
import type { TimelineEvent, TimelineKind } from '../observability';
import { BEATS, DEMO_JOBS, DEMO_TASKS, type MessageBeat, type PresenceBeat, type TaskBeat } from './script';
import { ambientWorkUpTo, dayStateAt } from './state';
import { isoAt } from './time';

const TASK_KIND: Readonly<Record<TaskBeat['status'], TimelineKind>> = { todo: 'task.created', doing: 'task.started', blocked: 'task.blocked', done: 'task.finished' };
type Ev = Omit<TimelineEvent, 'at'> & { readonly m: number };

function presenceEvent(b: PresenceBeat, i: number): Ev | null {
  const id = `p${i}`;
  switch (b.status) {
    case 'working': return b.activity ? { id, m: b.at, kind: 'activity', title: b.activity, source: 'demo' } : null;
    case 'error': return { id, m: b.at, kind: 'error', title: b.activity ?? 'Error', source: 'demo' };
    case 'needs-input': return { id, m: b.at, kind: 'status', title: 'Asked for your approval', ...(b.activity ? { detail: b.activity } : {}), source: 'demo' };
    case 'meeting': return { id, m: b.at, kind: 'status', title: 'In a meeting', ...(b.activity ? { detail: b.activity } : {}), source: 'demo' };
    default: return { id, m: b.at, kind: 'status', title: b.status === 'idle' ? 'Idle' : 'Offline', ...(b.activity ? { detail: b.activity } : {}), source: 'demo' };
  }
}

export function dayTimeline(agent: string, minute: number, seed: number): TimelineEvent[] {
  const owned = new Map(DEMO_TASKS.filter((t) => t.owner === agent).map((t) => [t.id, t.title]));
  const beats = BEATS.map((b, i) => ({ b, i })).filter(({ b }) => b.at <= minute);
  const presence = beats.flatMap(({ b, i }) => (b.kind === 'presence' && b.agent === agent ? [presenceEvent(b, i)] : [])).filter((e): e is Ev => e !== null);
  const tasks = beats.flatMap(({ b, i }): Ev[] => {
    const title = b.kind === 'task' ? owned.get(b.task) : undefined;
    return b.kind === 'task' && title ? [{ id: `t${i}`, m: b.at, kind: TASK_KIND[b.status], title, source: 'kanban' }] : [];
  });
  const said = beats.flatMap(({ b, i }): Ev[] => (b.kind === 'message' && b.from === agent
    ? [{ id: `m${i}`, m: b.at, kind: 'message.out', title: (b as MessageBeat).text, source: 'telegram' }] : []));
  const runs = DEMO_JOBS.filter((j) => j.agent === agent).flatMap((j, ji) => j.runs.filter((r) => r.at + r.minutes <= minute).map((r, ri): Ev => (
    r.status ? { id: `j${ji}-${ri}`, m: r.at + r.minutes, kind: 'cron.fail', title: j.name, detail: r.status, source: 'cron' }
      : { id: `j${ji}-${ri}`, m: r.at + r.minutes, kind: 'cron.ok', title: j.name, detail: 'delivered', source: 'cron' })));
  const ambient = ambientWorkUpTo(agent, minute, seed)
    .filter((w) => dayStateAt(w.start, seed).presence[agent]?.activity === w.text) // only the work it was free to pick up
    .map((w, i): Ev => ({ id: `a${i}`, m: w.start, kind: 'activity', title: w.text, source: 'demo' }));
  return [...presence, ...tasks, ...said, ...runs, ...ambient]
    .sort((a, b) => b.m - a.m || (a.id < b.id ? 1 : -1))
    .map(({ m, ...e }) => ({ ...e, at: isoAt(m) }));
}
