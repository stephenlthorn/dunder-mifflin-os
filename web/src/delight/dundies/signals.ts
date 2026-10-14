// What the Dundies count: one bot's week of events. From its timeline when its adapter keeps one; otherwise made
// from what the office snapshot shows (cards, the last run of each scheduled job, an error right now), so the demo
// day and timeline-less agents still get counted. Pure.
import type { OfficeSnapshot } from '@shared/contract';
import type { TimelineEvent, TimelineResponse, UsageReport } from '@shared/observability';

export type Window = { from: number; to: number }; // epoch ms, [from, to]
export type BotWeek = {
  personId: string;
  name: string;
  events: readonly TimelineEvent[];
  source: 'timeline' | 'snapshot';
  cost: number | null | undefined; // estimated USD for the week; null = unpriced, undefined = no usage data
  errorNow?: string; // the bot is in error right now (its activity)
};

export const WEEK_MS = 7 * 86_400_000;
export const weekWindow = (nowMs: number): Window => ({ from: nowMs - WEEK_MS, to: nowMs });

const inWindow = (iso: string | undefined, w: Window) => {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(t) && t >= w.from && t <= w.to;
};

const TASK_KIND = { done: 'task.finished', doing: 'task.started', blocked: 'task.blocked' } as const;

/** A bot's week as the snapshot shows it: its cards, its jobs' last runs and what it is doing now. */
export function snapshotEvents(s: OfficeSnapshot, personId: string, w: Window): TimelineEvent[] {
  const cards = s.tasks.filter((t) => t.ownerId === personId && t.status !== 'todo' && inWindow(t.updatedAt, w))
    .map((t): TimelineEvent => ({ id: `snap-task-${t.id}`, at: t.updatedAt, kind: TASK_KIND[t.status as keyof typeof TASK_KIND], title: t.title, source: 'board' }));
  const runs = (s.jobs?.[personId] ?? []).filter((j) => j.lastStatus !== 'running' && inWindow(j.lastRunAt, w)).map((j, i): TimelineEvent => {
    const ok = !j.lastStatus || j.lastStatus === 'ok';
    return { id: `snap-job-${i}`, at: j.lastRunAt!, kind: ok ? 'cron.ok' : 'cron.fail', title: j.name, ...(ok ? {} : { detail: j.lastStatus }), source: 'cron' };
  });
  const p = s.presence[personId];
  const now: TimelineEvent[] = p?.status === 'working' && p.activity && inWindow(p.since, w)
    ? [{ id: 'snap-now', at: p.since!, kind: 'activity', title: p.activity, source: 'board' }] : [];
  return [...cards, ...runs, ...now];
}

/** Every bot's week. `timelines[personId]` absent or unavailable = count it from the snapshot. */
export function botWeeks(s: OfficeSnapshot, timelines: Readonly<Record<string, TimelineResponse | undefined>>, usage: UsageReport | null, w: Window): BotWeek[] {
  const costs = new Map((usage?.rows ?? []).map((r) => [r.personId, r.usage ? r.usage.cost : undefined]));
  return s.people.filter((p) => p.bot).map((p): BotWeek => {
    const t = timelines[p.id];
    const fromTimeline = Boolean(t?.available);
    const presence = s.presence[p.id];
    const events = fromTimeline ? t!.events.filter((e) => inWindow(e.at, w)) : snapshotEvents(s, p.id, w);
    return {
      personId: p.id, name: p.name, events, source: fromTimeline ? 'timeline' : 'snapshot', cost: costs.get(p.id),
      ...(presence?.status === 'error' ? { errorNow: presence.activity?.trim() || 'Error' } : {}),
    };
  });
}
