// cron/jobs.json (via the Hermes seam) -> scheduled jobs keyed by profile (the office re-keys them by person). Names, schedules,
// the parsed rule and zone (both validated by the parser) only; free text is scrubbed and any remaining 6+ digit runs
// (possible short chat ids) are masked.
import type { ScheduledJob } from '../../../shared/contract.ts';
import type { CronJob } from '../hermes/types.ts';
import { isBotProfile } from '../roster.ts';
import { scrubText } from './scrub.ts';

const LONG_DIGITS = /\d{6,}/g;
export const maskJobText = (text: string): string => scrubText(text).replace(LONG_DIGITS, '…');
const mask = maskJobText;

/** The job's reference for "run now": its Hermes id behind a letter prefix (an all-digit id must not look like a chat id). */
export const jobRef = (id: string): string => `job${id}`;
const JOB_REF = /^job([A-Za-z0-9_-]{1,64})$/;
export const jobIdOf = (ref: string): string | null => JOB_REF.exec(ref)?.[1] ?? null;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function toJob(j: CronJob): ScheduledJob {
  return {
    ...(SAFE_ID.test(j.id) ? { id: jobRef(j.id) } : {}),
    name: mask(j.name), schedule: mask(j.schedule), enabled: j.enabled,
    ...(j.lastRunAt ? { lastRunAt: j.lastRunAt } : {}),
    ...(j.lastStatus ? { lastStatus: mask(j.lastStatus) } : {}),
    ...(j.nextRunAt ? { nextRunAt: j.nextRunAt } : {}),
    ...(j.rule ? { rule: { ...j.rule } } : {}),
    ...(j.timeZone ? { timeZone: j.timeZone } : {}),
  };
}

export function jobsByAgent(cron: ReadonlyArray<CronJob>): Record<string, ScheduledJob[]> {
  return cron.reduce<Record<string, ScheduledJob[]>>((acc, j) => {
    const profile = isBotProfile(j.profile) ? j.profile : undefined;
    return profile ? { ...acc, [profile]: [...(acc[profile] ?? []), toJob(j)] } : acc;
  }, {});
}
