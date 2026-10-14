// Demo-mode scheduled jobs for the Party Planning Committee calendar (no server). Invented, on Scranton time. Last
// and next runs are worked out from each rule around `now`, so the calendar lines up: one bot's job failed (Sadiq,
// whose desk shows an error), one missed this morning's run (Andy), one is paused.
import type { ScheduleRule, ScheduledJob } from '../contract';
import { parseCron } from '../schedule/cron';
import { cronTimes, intervalTimes } from '../schedule/expand';

export const DEMO_ZONE = 'America/New_York'; // Scranton, PA

type DemoJob = {
  readonly personId: string;
  readonly name: string;
  readonly rule: ScheduleRule;
  readonly lastStatus?: string; // default 'ok'
  readonly missed?: number; // runs skipped since the last one
  readonly enabled?: boolean;
};

const cron = (expr: string): ScheduleRule => ({ kind: 'cron', expr });
const JOBS: readonly DemoJob[] = [
  { personId: 'pam', name: 'Morning handoff digest', rule: cron('0 8 * * 1-5') },
  { personId: 'pam', name: 'Council agenda', rule: cron('0 9 * * 1') },
  { personId: 'michael', name: 'Marketing pulse', rule: cron('0 10 * * 1,3,5') },
  { personId: 'angela', name: 'Party Planning Committee budget', rule: cron('0 15 * * 4') },
  { personId: 'angela', name: 'Expense report sweep', rule: cron('30 16 * * 1-5') },
  { personId: 'dwight', name: 'Lead follow-ups', rule: cron('45 7 * * 1-5') },
  { personId: 'dwight', name: 'Weekly campaign report', rule: cron('0 16 * * 5') },
  { personId: 'kelly', name: 'Post queue check', rule: { kind: 'interval', minutes: 120 } },
  { personId: 'sadiq', name: 'Fleet health check', rule: cron('0 * * * *'), lastStatus: 'error: gateway timeout' },
  { personId: 'sadiq', name: 'Nightly backup verify', rule: cron('30 2 * * *'), enabled: false },
  { personId: 'andy', name: 'Skool member digest', rule: cron('0 7 * * *'), missed: 1 },
  { personId: 'oscar', name: 'Lesson plan review', rule: cron('0 13 * * 3') },
  { personId: 'ira', name: 'Lunch macro reminder', rule: cron('30 12 * * *') },
  { personId: 'jarvis', name: 'Inbox summary', rule: cron('0 8,12,17 * * *') },
  { personId: 'ryan', name: 'Trend scan', rule: cron('0 6 * * 1-5'), lastStatus: 'failed: offline' },
  { personId: 'david', name: 'Board digest', rule: cron('0 11 * * 5') },
];

const DAY_MS = 86_400_000;
const LATE_MS = 20_000; // runs start a few seconds after their time

function times(rule: ScheduleRule, now: number): readonly number[] {
  const span = { from: now - 9 * DAY_MS, to: now + 9 * DAY_MS };
  if (rule.kind === 'interval') return intervalTimes(rule.minutes, Math.floor(now / DAY_MS) * DAY_MS, span, 500).times;
  const spec = rule.kind === 'cron' ? parseCron(rule.expr) : null;
  return spec?.ok ? cronTimes(spec.spec, DEMO_ZONE, span, 500).times : [];
}

function toJob(j: DemoJob, now: number): ScheduledJob {
  const all = times(j.rule, now);
  const past = all.filter((t) => t <= now);
  const last = past[past.length - 1 - (j.missed ?? 0)];
  const next = all.find((t) => t > now);
  const enabled = j.enabled ?? true;
  return {
    name: j.name, schedule: j.rule.kind === 'cron' ? j.rule.expr : j.rule.kind === 'interval' ? `every ${j.rule.minutes / 60} h` : j.rule.at,
    enabled, rule: j.rule, timeZone: DEMO_ZONE,
    ...(last === undefined ? {} : { lastRunAt: new Date((enabled ? last : last - 2 * DAY_MS) + LATE_MS).toISOString(), lastStatus: j.lastStatus ?? 'ok' }),
    ...(enabled && next !== undefined ? { nextRunAt: new Date(next).toISOString() } : {}),
  };
}

/** The demo office's scheduled jobs by person id, as of `now`. */
export function demoScheduleJobs(now: number): Record<string, ScheduledJob[]> {
  return JOBS.reduce<Record<string, ScheduledJob[]>>((acc, j) => ({ ...acc, [j.personId]: [...(acc[j.personId] ?? []), toJob(j, now)] }), {});
}
