// "The documentary crew": a to-camera summary of a bot's day, built from its timeline events by a template (no LLM
// call). "Today Dwight ran Campaign report 3 times (1 failed at 09:14), finished 2 tasks, …". Pure.
import type { TimelineEvent } from '@shared/observability';
import { clockTime, startOfToday } from './timelineModel';

export type TalkingHeadOptions = { name: string; now: number; clock?: (ms: number) => string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const weight = (e: TimelineEvent) => e.count ?? 1;
const sum = (events: readonly TimelineEvent[]) => events.reduce((n, e) => n + weight(e), 0);
const latest = (events: readonly TimelineEvent[]) => Math.max(...events.map((e) => Date.parse(e.at)));

function list(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

function cronClause(events: readonly TimelineEvent[], clock: (ms: number) => string): string | null {
  const runs = events.filter((e) => e.kind === 'cron.ok' || e.kind === 'cron.fail');
  if (!runs.length) return null;
  const byJob = [...runs.reduce((acc, e) => {
    const prev = acc.get(e.title) ?? { n: 0, failed: 0 };
    return new Map([...acc, [e.title, { n: prev.n + 1, failed: prev.failed + (e.kind === 'cron.fail' ? 1 : 0) }]]);
  }, new Map<string, { n: number; failed: number }>())].sort((a, b) => b[1].n - a[1].n || b[1].failed - a[1].failed); // ties: failures first
  const named = byJob.slice(0, 2).map(([job, { n }]) => `${job} ${times(n)}`);
  const others = byJob.length - named.length;
  const ran = `ran ${list([...named, ...(others ? [plural(others, 'other job')] : [])])}`;
  const fails = runs.filter((e) => e.kind === 'cron.fail');
  if (!fails.length) return ran;
  const when = clock(latest(fails));
  return `${ran} (${fails.length === 1 ? `1 failed at ${when}` : `${fails.length} failed, the last at ${when}`})`;
}

function taskClause(events: readonly TimelineEvent[]): string | null {
  const done = events.filter((e) => e.kind === 'task.finished').length;
  const blocked = events.filter((e) => e.kind === 'task.blocked').length;
  const started = events.filter((e) => e.kind === 'task.started').length;
  const blockedNote = blocked ? ` (${blocked} ${blocked === 1 ? 'is' : 'are'} blocked)` : '';
  if (done) return `finished ${plural(done, 'task')}${blockedNote}`;
  if (started) return `started ${plural(started, 'task')}${blockedNote}`;
  return blocked ? `got stuck on ${plural(blocked, 'task')}` : null;
}

function messageClause(events: readonly TimelineEvent[]): string | null {
  const got = sum(events.filter((e) => e.kind === 'message.in'));
  const sent = sum(events.filter((e) => e.kind === 'message.out'));
  if (got && sent) return `got ${plural(got, 'message')} and sent ${sent}`;
  if (sent) return `sent ${plural(sent, 'message')}`;
  return got ? `got ${plural(got, 'message')}` : null;
}

function errorClause(events: readonly TimelineEvent[], clock: (ms: number) => string): string | null {
  const errors = events.filter((e) => e.kind === 'error');
  const n = sum(errors);
  if (!n) return null;
  return `hit ${plural(n, 'error')}, ${n === 1 ? 'at' : 'the last at'} ${clock(latest(errors))}`;
}

export function talkingHead(all: readonly TimelineEvent[], opts: TalkingHeadOptions): string {
  const clock = opts.clock ?? clockTime;
  const from = startOfToday(opts.now);
  const events = all.filter((e) => Date.parse(e.at) >= from);
  if (!events.length) return `Nothing on camera yet today. ${opts.name} is keeping a low profile.`;
  const tools = sum(events.filter((e) => e.kind === 'tool.call'));
  const sessions = events.filter((e) => e.kind === 'session.started').length;
  const clauses = [
    cronClause(events, clock),
    taskClause(events),
    messageClause(events),
    tools ? `made ${plural(tools, 'tool call')}` : null,
    sessions ? `opened ${plural(sessions, 'session')}` : null,
    errorClause(events, clock),
  ].filter((c): c is string => c !== null);
  if (!clauses.length) return `Not much on camera today: ${plural(events.length, 'status update')} from ${opts.name}.`;
  return `Today ${opts.name} ${list(clauses)}.`;
}
