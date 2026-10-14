// Dwight's bobblehead nods when the bot at his desk finishes a run: it goes from working to idle, one of its cards is
// just done, or (when the snapshot carries fresh jobs) a scheduled job finished a run. Compares two snapshots; pure.
import type { OfficeSnapshot } from '@shared/contract';

const finished = (status: string | undefined) => status !== 'running';

export function finishedRun(prev: OfficeSnapshot | null, next: OfficeSnapshot, personId: string): boolean {
  if (!prev) return false;
  const before = new Map((prev.jobs?.[personId] ?? []).map((j) => [j.name, j]));
  const ran = (next.jobs?.[personId] ?? []).some((j) => {
    const was = before.get(j.name);
    if (!j.lastRunAt || !finished(j.lastStatus)) return false;
    return j.lastRunAt > (was?.lastRunAt ?? '') || (j.lastRunAt === was?.lastRunAt && !finished(was.lastStatus)); // a new run, or the one running ended
  });
  const wasDone = new Set(prev.tasks.filter((t) => t.status === 'done').map((t) => t.id));
  const done = next.tasks.some((t) => t.ownerId === personId && t.status === 'done' && !wasDone.has(t.id));
  const stopped = prev.presence[personId]?.status === 'working' && next.presence[personId]?.status === 'idle';
  return ran || done || stopped;
}
