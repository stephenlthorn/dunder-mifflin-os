// cron/jobs.json and personas.json: display fields only (never prompts, scripts, origins or delivery targets),
// plus the schedule rule (cron expression, interval or one-off time) and the profile's time zone for the calendar.
import type { ScheduleRule } from '../../../shared/contract.ts';
import { parseCron } from '../../../shared/schedule/cron.ts';
import { isTimeZone } from '../../../shared/schedule/zone.ts';
import type { CronJob } from './types.ts';
import { arr, isProfileKey, isRecord, num, str } from './guards.ts';

const MAX_INTERVAL_MINUTES = 366 * 24 * 60;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/** Hermes `schedule`: { kind: 'cron', expr } | { kind: 'interval', minutes } | { kind: 'once', run_at }. Anything else: none. */
export function parseScheduleRule(schedule: unknown): ScheduleRule | null {
  if (!isRecord(schedule)) return null;
  if (schedule.kind === 'cron') {
    const expr = str(schedule.expr, 100)?.trim();
    return expr && parseCron(expr).ok ? { kind: 'cron', expr } : null;
  }
  if (schedule.kind === 'interval') {
    const minutes = num(schedule.minutes);
    return minutes !== null && minutes >= 1 && minutes <= MAX_INTERVAL_MINUTES ? { kind: 'interval', minutes } : null;
  }
  if (schedule.kind === 'once') {
    const at = str(schedule.run_at, 40)?.trim();
    return at && ISO_INSTANT.test(at) && Number.isFinite(Date.parse(at)) ? { kind: 'once', at } : null;
  }
  return null;
}

/** config.yaml `timezone` (Hermes: empty = the machine's zone). */
export function parseHermesTimeZone(doc: unknown): string | null {
  const tz = isRecord(doc) ? doc.timezone : null;
  return isTimeZone(tz) ? tz : null;
}

export function parseCronJobs(profile: string, json: unknown, timeZone: string | null = null): CronJob[] {
  const jobs = isRecord(json) ? arr(json.jobs) : [];
  return jobs.flatMap((job): CronJob[] => {
    if (!isRecord(job)) return [];
    const id = str(job.id, 64);
    const name = str(job.name, 120);
    if (!id || !name) return [];
    const rule = parseScheduleRule(job.schedule);
    return [{
      profile, id, name,
      enabled: job.enabled === true,
      schedule: str(job.schedule_display, 80) ?? '',
      nextRunAt: str(job.next_run_at, 40),
      lastRunAt: str(job.last_run_at, 40),
      lastStatus: str(job.last_status, 40),
      ...(rule ? { rule } : {}),
      ...(timeZone ? { timeZone } : {}),
    }];
  });
}

export function parsePersonas(json: unknown): Record<string, string> {
  if (!isRecord(json)) return {};
  return Object.fromEntries(
    Object.entries(json).flatMap(([profile, persona]) => {
      const character = isRecord(persona) ? str(persona.character, 60)?.trim() : null;
      return isProfileKey(profile) && character ? [[profile, character]] : [];
    }),
  );
}
