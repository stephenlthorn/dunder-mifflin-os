// Words and icons for the calendar: run states (never colour alone), how a job repeats, "in 2 h 30 min".
import type { CalendarJob, CalendarRun } from '@shared/contract';
import { parseCron } from '@shared/schedule/cron';

export const RUN_META: Readonly<Record<CalendarRun, { icon: string; word: string; key: string }>> = {
  ok: { icon: '✓', word: 'ran OK', key: 'Ran OK' },
  failed: { icon: '!', word: 'failed', key: 'Failed' },
  missed: { icon: '✕', word: 'didn’t run', key: 'Didn’t run' },
  unknown: { icon: '·', word: 'ran (result not kept)', key: 'Earlier run' },
  upcoming: { icon: '○', word: 'scheduled', key: 'Scheduled' },
};

export function repeatsText(job: CalendarJob): string {
  const how = job.repeats === 'cron' && parseCron(job.schedule).ok ? `cron ${job.schedule}` : job.schedule;
  return job.enabled ? how : `${how} · paused`;
}

export function inText(iso: string, now: number): string {
  const mins = Math.floor((Date.parse(iso) - now) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `in ${mins} min`;
  if (mins < 24 * 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `in ${h} h` : `in ${h} h ${m} min`;
  }
  const days = Math.round(mins / (24 * 60));
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
