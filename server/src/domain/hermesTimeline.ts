// Raw Hermes activity (hermes/activityTypes.ts) -> timeline events. Pure. Free text goes out only as one short,
// scrubbed line (oneLine.ts): message summaries, session titles, job names, task TITLES (never bodies or results),
// the first line of a cron error and of an errors.log record. Ids are hashed so no raw Hermes id leaves the server.
import { createHash } from 'node:crypto';
import type { TimelineEvent } from '../../../shared/observability.ts';
import type { CronRunRecord, HermesActivity, LogErrorRecord, RunRecord, SessionRecord, ToolBurst } from '../hermes/activityTypes.ts';
import type { EpochSeconds } from '../hermes/types.ts';
import { firstLine, oneLine } from './oneLine.ts';

const SESSION_NAMES: Readonly<Record<string, string>> = {
  telegram: 'Telegram chat', cli: 'Terminal session', api: 'API session', subagent: 'Subagent', dashboard: 'Dashboard session',
};
const FAILED_RUNS = new Set(['crashed', 'timed_out', 'failed', 'spawn_failed', 'gave_up']);
const SKIPPED_RUNS = new Set(['reclaimed', 'released']);
const TOOLS_NAMED = 3;

const iso = (t: EpochSeconds) => new Date(t * 1000).toISOString();
/** 'h' + 12 hex: never a bare digit run (which would look like a chat id to the leak scans). */
const hash = (s: string) => `h${createHash('sha256').update(s).digest('hex').slice(0, 12)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

type Ev = Omit<TimelineEvent, 'at'> & { readonly t: EpochSeconds };

function sessionEvents(s: SessionRecord): Ev[] {
  const title = s.title ? oneLine(s.title) : (SESSION_NAMES[s.source ?? ''] ?? 'Session');
  const source = s.source ? { source: s.source } : {};
  const started: Ev = { id: `s-${hash(s.id)}-start`, t: s.startedAt, kind: 'session.started', title, ...source };
  if (s.endedAt === null) return [started];
  const detail = s.messageCount ? { detail: plural(s.messageCount, 'message') } : {};
  return [started, { id: `s-${hash(s.id)}-end`, t: s.endedAt, kind: 'session.ended', title, ...detail, ...source }];
}

/** 'mcp__crm__list_leads' -> 'crm: list_leads'. */
export function toolLabel(name: string): string {
  const mcp = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(name);
  return mcp ? `${mcp[1]}: ${mcp[2]}` : name;
}

function toolEvent(b: ToolBurst): Ev {
  return {
    id: `tools-${hash(b.sessionId)}`, t: b.lastAt, kind: 'tool.call',
    title: oneLine(b.tools.slice(0, TOOLS_NAMED).map((x) => toolLabel(x.name)).join(', ')),
    detail: plural(b.count, 'tool call'), count: b.count, ...(b.source ? { source: b.source } : {}),
  };
}

function runEvents(r: RunRecord): Ev[] {
  if (SKIPPED_RUNS.has(r.outcome ?? r.status)) return [];
  const title = oneLine(r.title);
  const base = { title, source: 'kanban' };
  const started: Ev = { id: `run-${hash(r.id)}-start`, t: r.startedAt, kind: 'task.started', ...base };
  if (r.endedAt === null) return [started];
  const outcome = r.outcome ?? r.status;
  const end = `run-${hash(r.id)}-end`;
  if (FAILED_RUNS.has(outcome)) return [started, { id: end, t: r.endedAt, kind: 'error', ...base, detail: `Run ${outcome.replace(/_/g, ' ')}` }];
  if (outcome === 'blocked') return [started, { id: end, t: r.endedAt, kind: 'task.blocked', ...base }];
  return [started, { id: end, t: r.endedAt, kind: 'task.finished', ...base }];
}

function cronEvent(c: CronRunRecord): Ev {
  const title = c.jobName ? oneLine(c.jobName) : 'Scheduled job';
  if (!c.ok) return { id: `cron-${hash(c.id)}`, t: c.at, kind: 'cron.fail', title, detail: (c.error && firstLine(c.error)) || 'failed', source: 'cron' };
  const detail = c.delivery === 'suppressed' ? 'nothing to send' : c.delivery ? oneLine(c.delivery, 30) : undefined;
  return { id: `cron-${hash(c.id)}`, t: c.at, kind: 'cron.ok', title, ...(detail ? { detail } : {}), source: 'cron' };
}

/** The same error logged again and again becomes one event, at its latest time, with a count. */
function errorEvents(errors: ReadonlyArray<LogErrorRecord>): Ev[] {
  const folded = errors.reduce((acc, e) => {
    const title = firstLine(`${e.logger}: ${e.message}`);
    const prev = acc.get(title);
    return new Map([...acc, [title, prev ? { t: Math.max(prev.t, e.at), n: prev.n + 1 } : { t: e.at, n: 1 }]]);
  }, new Map<string, { t: number; n: number }>());
  return [...folded].map(([title, { t, n }]): Ev => ({
    id: `log-${hash(title)}`, t, kind: 'error', title, source: 'log', ...(n > 1 ? { count: n, detail: `${n} times` } : {}),
  }));
}

export function hermesTimeline(a: HermesActivity, opts: { since: EpochSeconds; limit: number }): TimelineEvent[] {
  const all: Ev[] = [
    ...a.sessions.flatMap(sessionEvents),
    ...a.messages.map((m): Ev => ({
      id: `msg-${hash(m.id)}`, t: m.at, kind: m.role === 'user' ? 'message.in' : 'message.out', title: oneLine(m.text), ...(m.source ? { source: m.source } : {}),
    })),
    ...a.tools.map(toolEvent),
    ...a.tasks.map((t): Ev => ({ id: `task-${hash(t.id)}`, t: t.createdAt, kind: 'task.created', title: oneLine(t.title), source: 'kanban' })),
    ...a.runs.flatMap(runEvents),
    ...a.cron.map(cronEvent),
    ...errorEvents(a.errors),
  ];
  return all
    .filter((e) => e.t >= opts.since && e.title)
    .sort((x, y) => y.t - x.t)
    .slice(0, opts.limit)
    .map(({ t, ...e }) => ({ ...e, at: iso(t) }));
}
