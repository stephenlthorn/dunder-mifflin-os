// The demo day at any office minute: the script folded up to that minute, scheduled jobs that are running or have
// run, and the seeded ambient work idle bots pick up in between. Pure and deterministic: the same minute and seed
// always give the same office. Room keys are local (the adapter prefixes them); times are ISO office time.
import type { ScheduledJob, Task } from '../contract';
import { AMBIENT } from './lines';
import { rng, pick } from './random';
import { BEATS, DEMO_JOBS, DEMO_TASKS, type DemoJobSpec, type MessageBeat, type PresenceBeat, type TaskBeat } from './script';
import { DEMO_CAST, type DemoStatus } from './cast';
import { DAY_END, DAY_START, isoAt } from './time';

export type DemoPresence = { readonly status: DemoStatus; readonly activity?: string; readonly since: string; readonly room?: string };
export type DemoTask = {
  readonly id: string; readonly title: string; readonly status: Task['status']; readonly owner: string;
  readonly room?: string; readonly shared: boolean; readonly updatedAt: string;
};
export type DemoMessage = { readonly id: string; readonly room: string; readonly from: string; readonly text: string; readonly at: number };
export type DemoDayState = {
  readonly presence: Readonly<Record<string, DemoPresence>>;
  readonly tasks: ReadonlyArray<DemoTask>;
  readonly jobs: Readonly<Record<string, ReadonlyArray<ScheduledJob>>>;
};

type Burst = { readonly agent: string; readonly start: number; readonly end: number; readonly text: string };
type Scripted = { status: DemoStatus; activity?: string; since: number; room?: string };

const NOT_IN: Scripted = { status: 'offline', activity: 'Not in yet', since: DAY_START };
const PRESENCE = BEATS.filter((b): b is PresenceBeat => b.kind === 'presence');
const TASK_BEATS = BEATS.filter((b): b is TaskBeat => b.kind === 'task');
const MESSAGES: ReadonlyArray<DemoMessage> = Object.freeze(BEATS.filter((b): b is MessageBeat => b.kind === 'message')
  .map((b, i) => Object.freeze({ id: `m${i + 1}`, room: b.room, from: b.from, text: b.text, at: b.at })));

/** Ambient work: in some hours an idle bot does a small thing for 6 to 14 minutes, starting between :20 and :49. */
function ambientBursts(seed: number): ReadonlyArray<Burst> {
  return DEMO_CAST.flatMap(({ agent }) => Array.from({ length: 8 }, (_, i) => 9 + i).flatMap((hour): Burst[] => {
    const next = rng(seed, agent, hour);
    const text = next() < 0.5 ? pick(AMBIENT[agent] ?? [], next) : undefined;
    if (!text) return [];
    const start = hour * 60 + 20 + Math.floor(next() * 30);
    return [{ agent, start, end: start + 6 + Math.floor(next() * 9), text }];
  }));
}

let cached: { readonly seed: number; readonly bursts: ReadonlyArray<Burst>; readonly changes: ReadonlyArray<number> } | null = null;

function forSeed(seed: number) {
  if (cached?.seed === seed) return cached;
  const bursts = ambientBursts(seed);
  const points = [
    ...PRESENCE.map((b) => b.at), ...TASK_BEATS.map((b) => b.at),
    ...DEMO_JOBS.flatMap((j) => j.runs.flatMap((r) => [r.at, r.at + r.minutes])),
    ...bursts.flatMap((b) => [b.start, b.end]),
  ];
  cached = { seed, bursts, changes: [...new Set(points)].sort((a, b) => a - b) };
  return cached;
}

function scripted(agent: string, minute: number): Scripted {
  return PRESENCE.filter((b) => b.agent === agent && b.at <= minute).reduce<Scripted>((cur, b) => ({
    status: b.status,
    since: b.status === cur.status ? cur.since : b.at,
    ...(b.activity ? { activity: b.activity } : {}),
    ...(b.room ? { room: b.room } : {}),
  }), NOT_IN);
}

const runningJob = (agent: string, minute: number) => DEMO_JOBS.filter((j) => j.agent === agent)
  .flatMap((j) => j.runs.filter((r) => r.at <= minute && minute < r.at + r.minutes).map((r) => ({ name: j.name, at: r.at })))[0];

function presenceOf(agent: string, minute: number, bursts: ReadonlyArray<Burst>): DemoPresence {
  const base = scripted(agent, minute);
  const free = base.status === 'idle' && base.activity === undefined;
  const job = free ? runningJob(agent, minute) : undefined;
  const burst = free && !job ? bursts.find((b) => b.agent === agent && b.start <= minute && minute < b.end) : undefined;
  const shown: Scripted = job ? { status: 'working', activity: `Running: ${job.name}`, since: job.at }
    : burst ? { status: 'working', activity: burst.text, since: burst.start } : base;
  return { ...shown, since: isoAt(shown.since) };
}

function taskAt(spec: (typeof DEMO_TASKS)[number], minute: number): DemoTask | null {
  const last = TASK_BEATS.filter((b) => b.task === spec.id && b.at <= minute).at(-1);
  if (!last) return null;
  return {
    id: spec.id, title: spec.title, status: last.status, owner: spec.owner,
    ...(spec.room ? { room: spec.room } : {}), shared: spec.shared === true, updatedAt: isoAt(last.at),
  };
}

function jobAt(spec: DemoJobSpec, minute: number): ScheduledJob {
  const running = spec.runs.find((r) => r.at <= minute && minute < r.at + r.minutes);
  const done = spec.runs.filter((r) => r.at + r.minutes <= minute).at(-1);
  const yesterday = spec.runs.at(-1);
  const last = running ? { at: isoAt(running.at), status: 'running' }
    : done ? { at: isoAt(done.at), status: done.status ?? 'ok' }
      : yesterday ? { at: isoAt(yesterday.at, -1), status: 'ok' } : null;
  const upcoming = spec.runs.find((r) => r.at > minute);
  const next = !spec.enabled ? undefined : upcoming ? isoAt(upcoming.at) : spec.runs[0] ? isoAt(spec.runs[0].at, 1) : undefined;
  return {
    name: spec.name, schedule: spec.schedule, enabled: spec.enabled,
    ...(last ? { lastRunAt: last.at, lastStatus: last.status } : {}), ...(next ? { nextRunAt: next } : {}),
  };
}

export function dayStateAt(minute: number, seed: number): DemoDayState {
  const { bursts } = forSeed(seed);
  const agents = DEMO_CAST.map((c) => c.agent);
  return {
    presence: Object.fromEntries(agents.map((a) => [a, presenceOf(a, minute, bursts)])),
    tasks: DEMO_TASKS.flatMap((spec) => taskAt(spec, minute) ?? []),
    jobs: Object.fromEntries(agents.flatMap((a) => {
      const jobs = DEMO_JOBS.filter((j) => j.agent === a).map((j) => jobAt(j, minute));
      return jobs.length ? [[a, jobs]] : [];
    })),
  };
}

/** The scripted chat messages sent up to an office minute, oldest first. */
export function messagesUpTo(minute: number): ReadonlyArray<DemoMessage> {
  return MESSAGES.filter((msg) => msg.at <= minute);
}

/** The ambient work an idle bot picked up before `minute` (its timeline shows it). */
export function ambientWorkUpTo(agent: string, minute: number, seed: number): ReadonlyArray<{ readonly start: number; readonly text: string }> {
  return forSeed(seed).bursts.filter((b) => b.agent === agent && b.start <= minute).map((b) => ({ start: b.start, text: b.text }));
}

/** The next office minute after `minute` at which dayStateAt can change (17:30 at the latest: the day loops). */
export function nextChangeAfter(minute: number, seed: number): number {
  return forSeed(seed).changes.find((c) => c > minute) ?? DAY_END;
}
