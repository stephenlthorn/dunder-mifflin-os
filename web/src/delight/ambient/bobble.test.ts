import { describe, expect, it } from 'vitest';
import { DEMO_OFFICE } from '@shared/fixtures/demo-approvals';
import { finishedRun } from './bobble';

const jobs = DEMO_OFFICE.jobs!;
const withDwightJob = (lastRunAt: string, lastStatus: string) => ({
  ...DEMO_OFFICE, jobs: { ...jobs, dwight: [{ ...jobs.dwight![0]!, lastRunAt, lastStatus }] },
});

describe('finishedRun (Dwight\'s bobblehead nods)', () => {
  it('nods when a scheduled job at the desk finishes a new run, or one of its cards is done', () => {
    const before = withDwightJob('2026-10-13T14:00:00.000Z', 'ok');
    expect(finishedRun(before, withDwightJob('2026-10-13T15:00:00.000Z', 'ok'), 'dwight')).toBe(true);
    expect(finishedRun(before, withDwightJob('2026-10-13T15:00:00.000Z', 'error: boom'), 'dwight')).toBe(true);
    const running = withDwightJob('2026-10-13T15:00:00.000Z', 'running');
    expect(finishedRun(running, withDwightJob('2026-10-13T15:00:00.000Z', 'ok'), 'dwight')).toBe(true); // the run it was doing ended
    const done = { ...before, tasks: before.tasks.map((t) => (t.ownerId === 'dwight' ? { ...t, status: 'done' as const } : t)) };
    expect(finishedRun(before, done, 'dwight')).toBe(true);
  });

  it('nods when the bot goes from working to idle (a run ended), not when it crashes', () => {
    const at = (status: 'working' | 'idle' | 'error') => ({ ...DEMO_OFFICE, presence: { ...DEMO_OFFICE.presence, dwight: { status } } });
    expect(finishedRun(at('working'), at('idle'), 'dwight')).toBe(true);
    expect(finishedRun(at('working'), at('error'), 'dwight')).toBe(false);
    expect(finishedRun(at('idle'), at('idle'), 'dwight')).toBe(false);
  });

  it('stays still for a run in progress, someone else\'s run, nothing new, or the first look', () => {
    const before = withDwightJob('2026-10-13T14:00:00.000Z', 'ok');
    expect(finishedRun(before, withDwightJob('2026-10-13T15:00:00.000Z', 'running'), 'dwight')).toBe(false);
    expect(finishedRun(before, before, 'dwight')).toBe(false);
    expect(finishedRun(before, withDwightJob('2026-10-13T15:00:00.000Z', 'ok'), 'kelly')).toBe(false);
    expect(finishedRun(null, before, 'dwight')).toBe(false);
  });
});
