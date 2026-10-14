// The timing line under a scheduled job: "last 4 h ago (ok) · next in 20 h". Pure.
import type { ScheduledJob } from '@shared/contract';
import { sinceText } from './status';

function inText(t: number, now: number): string {
  const mins = Math.round((t - now) / 60_000);
  if (mins < 60) return `in ${mins} min`;
  return mins < 1440 ? `in ${Math.round(mins / 60)} h` : `in ${Math.round(mins / 1440)} d`;
}

function nextText(job: ScheduledJob, now: number): string | null {
  const t = job.enabled && job.nextRunAt ? Date.parse(job.nextRunAt) : Number.NaN;
  if (Number.isNaN(t)) return null; // paused jobs have no next run
  return t <= now ? 'next due now' : `next ${inText(t, now)}`;
}

function lastText(job: ScheduledJob, now: number): string | null {
  const since = sinceText(job.lastRunAt, now);
  return since ? `last ${since}${job.lastStatus ? ` (${job.lastStatus})` : ''}` : null;
}

export function jobTiming(job: ScheduledJob, now: number): string {
  return [lastText(job, now), nextText(job, now)].filter((s): s is string => s !== null).join(' · ');
}
