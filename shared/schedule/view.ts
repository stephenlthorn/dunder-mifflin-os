// Scheduled jobs (by person) + a span -> the Party Planning Committee calendar (ScheduleView). Pure; the server
// answers GET /api/schedule with it and demo mode builds it in the browser.
// Runs are expanded from each job's rule. Only the LAST run's result is known (jobs carry lastRunAt/lastStatus):
// the run it belongs to gets that status, earlier runs are `unknown`, and a run that was due after the last one
// (more than GRACE_MS ago) is `missed`. A last run far from any scheduled time is shown at its own time.
import type { CalendarJob, CalendarRun, Occurrence, ScheduleRule, ScheduleView, ScheduledJob } from '../contract';
import { parseCron } from './cron';
import { cronTimes, intervalTimes, onceTime, ruleFromText, type Expansion, type Span } from './expand';
import { isTimeZone } from './zone';

export type ScheduleInput = {
  readonly jobs: Readonly<Record<string, ReadonlyArray<ScheduledJob>>>; // by person id
  readonly span: Span;
  readonly now: number; // epoch ms
  readonly defaultTimeZone: string;
  readonly limits?: { readonly perJob: number; readonly total: number };
};

const MINUTE = 60_000;
const GRACE_MS = 10 * MINUTE; // a run due less than this long ago may still be starting
const LATE_START_MS = 30 * MINUTE; // how late a recorded run may start and still belong to a scheduled time
const SAME_RUN_MS = 90_000;
const NEXT_UP_HORIZON_MS = 8 * 24 * 60 * MINUTE;
const LIMITS = { perJob: 2000, total: 6000 };
const NONE: Expansion = { times: [], truncated: false };

const OK = /^(ok|success|succeeded|completed?|done)\b/i;
const FAILED = /(error|fail|crash|timed?[\s_-]?out)/i;

export function runOf(status: string | undefined): CalendarRun {
  if (!status) return 'unknown';
  if (OK.test(status)) return 'ok';
  return FAILED.test(status) ? 'failed' : 'unknown';
}

const parse = (iso: string | undefined): number | null => {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(t) ? t : null;
};
const inSpan = (t: number | null, span: Span): t is number => t !== null && t >= span.from && t < span.to;
const iso = (t: number) => new Date(t).toISOString();

type Prepared = { readonly key: string; readonly personId: string; readonly job: ScheduledJob; readonly rule: ScheduleRule | null; readonly zone: string };

function expand(p: Prepared, span: Span, limit: number): Expansion {
  const { job, rule, zone } = p;
  if (!job.enabled) return NONE;
  if (rule?.kind === 'cron') {
    const cron = parseCron(rule.expr);
    return cron.ok ? cronTimes(cron.spec, zone, span, limit) : NONE;
  }
  if (rule?.kind === 'interval') {
    const anchor = parse(job.nextRunAt) ?? parse(job.lastRunAt);
    return anchor === null ? NONE : intervalTimes(rule.minutes, anchor, span, limit);
  }
  const single = rule?.kind === 'once' ? onceTime(rule.at, zone) : parse(job.nextRunAt);
  return { times: inSpan(single, span) ? [single] : [], truncated: false };
}

function occurrencesOf(p: Prepared, span: Span, now: number, limit: number): { list: Occurrence[]; truncated: boolean } {
  const { times, truncated } = expand(p, span, limit);
  const last = parse(p.job.lastRunAt);
  const next = parse(p.job.nextRunAt);
  const lastRun = runOf(p.job.lastStatus);
  const matched = last === null ? -1 : times.findLastIndex((t) => t <= last + MINUTE && last - t <= LATE_START_MS);
  const runAt = (t: number): CalendarRun => {
    if (t > now - GRACE_MS) return 'upcoming';
    return p.job.enabled && last !== null && t > last + MINUTE ? 'missed' : 'unknown';
  };
  const list = times.map((t, i): Occurrence => ({ jobKey: p.key, at: iso(t), run: i === matched ? lastRun : runAt(t) }));
  const extraLast: Occurrence[] = matched < 0 && inSpan(last, span)
    ? [{ jobKey: p.key, at: iso(last), run: lastRun, ...(times.length > 0 ? { offSchedule: true } : {}) }] : [];
  const extraNext: Occurrence[] = p.job.enabled && inSpan(next, span) && next > now && !times.some((t) => Math.abs(t - next) < SAME_RUN_MS)
    ? [{ jobKey: p.key, at: iso(next), run: 'upcoming' }] : [];
  return { list: [...list, ...extraLast, ...extraNext], truncated };
}

function nextRunOf(p: Prepared, now: number): number | null {
  if (!p.job.enabled) return null;
  const next = parse(p.job.nextRunAt);
  if (next !== null && next > now) return next;
  return expand(p, { from: now + 1, to: now + NEXT_UP_HORIZON_MS }, 1).times[0] ?? null;
}

function calendarJob(p: Prepared): CalendarJob {
  const { job } = p;
  return {
    key: p.key, personId: p.personId, name: job.name, schedule: job.schedule, repeats: p.rule?.kind ?? 'unknown', enabled: job.enabled, timeZone: p.zone,
    ...(job.lastRunAt ? { lastRunAt: job.lastRunAt } : {}),
    ...(job.lastStatus ? { lastStatus: job.lastStatus } : {}),
    ...(job.nextRunAt ? { nextRunAt: job.nextRunAt } : {}),
  };
}

const byTime = (a: Occurrence, b: Occurrence) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.jobKey < b.jobKey ? -1 : a.jobKey > b.jobKey ? 1 : 0);

export function buildScheduleView(input: ScheduleInput): ScheduleView {
  const limits = input.limits ?? LIMITS;
  const prepared = Object.entries(input.jobs).flatMap(([personId, jobs]) => jobs.map((job, i): Prepared => ({
    key: `${personId}-${i}`, personId, job,
    rule: job.rule ?? ruleFromText(job.schedule),
    zone: isTimeZone(job.timeZone) ? job.timeZone : input.defaultTimeZone,
  })));
  const expanded = prepared.map((p) => occurrencesOf(p, input.span, input.now, limits.perJob));
  const all = expanded.flatMap((e) => e.list).sort(byTime);
  const soonest = prepared
    .map((p) => ({ key: p.key, at: nextRunOf(p, input.now) }))
    .reduce<{ key: string; at: number } | null>((best, c) => (c.at !== null && (!best || c.at < best.at) ? { key: c.key, at: c.at } : best), null);
  const flagged = all.slice(0, limits.total).map((o) =>
    (soonest && o.jobKey === soonest.key && Math.abs(Date.parse(o.at) - soonest.at) < SAME_RUN_MS ? { ...o, nextUp: true } : o));
  const truncated = all.length > limits.total || expanded.some((e) => e.truncated);
  return {
    from: iso(input.span.from), to: iso(input.span.to), generatedAt: iso(input.now), timeZone: input.defaultTimeZone,
    jobs: prepared.map(calendarJob),
    occurrences: flagged,
    ...(soonest ? { nextUp: { jobKey: soonest.key, at: iso(soonest.at) } } : {}),
    ...(truncated ? { truncated: true } : {}),
  };
}
