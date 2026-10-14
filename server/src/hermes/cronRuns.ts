// profiles/<p>/cron/executions.db -> finished scheduled-job runs (completed / failed) in a window, named after
// their job in cron/jobs.json. Times there are ISO strings with the machine's UTC offset, so the SQL only narrows
// by date and the exact window is applied here.
import type { EpochSeconds } from './types.ts';
import { ACTIVITY_TEXT_MAX, type CronRunRecord } from './activityTypes.ts';
import { str } from './guards.ts';
import type { ReadDb, Row } from './sqlite.ts';

const MAX_SCAN = 5000;
const FINISHED: Readonly<Record<string, boolean>> = { completed: true, failed: false };

const epochOf = (iso: unknown): number | null => {
  const ms = typeof iso === 'string' ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(ms) ? ms / 1000 : null;
};

function toRun(r: Row, names: ReadonlyMap<string, string>): CronRunRecord | null {
  const id = str(r.id, 64);
  const jobId = str(r.job_id, 64);
  const status = str(r.status, 20) ?? '';
  const at = epochOf(r.finished_at) ?? epochOf(r.started_at);
  if (!id || !jobId || !(status in FINISHED) || at === null) return null;
  return {
    id, jobId, jobName: names.get(jobId) ?? null, ok: FINISHED[status] === true, at,
    delivery: str(r.delivery_outcome, 30), error: str(r.error, ACTIVITY_TEXT_MAX),
  };
}

export function readCronRuns(db: ReadDb, names: ReadonlyMap<string, string>, since: EpochSeconds, limit: number): CronRunRecord[] {
  const day = new Date((since - 86_400) * 1000).toISOString().slice(0, 10); // a day early: offsets differ from UTC
  return db.all(
    `SELECT id, job_id, status, started_at, finished_at, delivery_outcome, substr(error, 1, ${ACTIVITY_TEXT_MAX}) AS error FROM executions
     WHERE claimed_at >= ? ORDER BY claimed_at DESC LIMIT ${MAX_SCAN}`, day,
  ).map((r) => toRun(r, names))
    .filter((r): r is CronRunRecord => r !== null && r.at >= since)
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
}
