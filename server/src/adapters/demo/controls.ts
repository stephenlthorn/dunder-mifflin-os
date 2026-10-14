// The control verbs on the demo day, in memory: cards you stopped (blocked from then on), cards you handed to another
// bot, and jobs you ran now (running for a few office minutes, then ok). Like the rest of your changes, they last
// until the day loops. Pure and immutable: each change makes a new value.
import type { Presence, ScheduledJob } from '../../../../shared/contract.ts';
import { isoAt } from '../../../../shared/demo/time.ts';
import type { AgentTask } from '../types.ts';

export type ManualRun = { readonly agent: string; readonly job: string; readonly name: string; readonly at: number };
export type ControlMemory = {
  readonly day: number;
  readonly stopped: Readonly<Record<string, number>>; // task id -> office minute it was stopped
  readonly owners: Readonly<Record<string, string>>; // task id -> the demo bot it was handed to
  readonly runs: ReadonlyArray<ManualRun>;
};

export const RUN_MINUTES = 5;
const MAX_RUNS = 50;

export const emptyControls = (day: number): ControlMemory => ({ day, stopped: {}, owners: {}, runs: [] });
export const controlsFor = (memory: ControlMemory, day: number): ControlMemory => (memory.day === day ? memory : emptyControls(day));
export const jobRef = (agent: string, index: number): string => `job-${agent}-${index}`;

export const stopTask = (m: ControlMemory, taskId: string, minute: number): ControlMemory => ({ ...m, stopped: { ...m.stopped, [taskId]: minute } });
export const handOver = (m: ControlMemory, taskId: string, to: string): ControlMemory => ({ ...m, owners: { ...m.owners, [taskId]: to } });
export const addRun = (m: ControlMemory, run: ManualRun): ControlMemory => ({ ...m, runs: [...m.runs, run].slice(-MAX_RUNS) });

export const runningNow = (m: ControlMemory, agent: string, minute: number, job?: string): ManualRun | undefined =>
  m.runs.find((r) => r.agent === agent && (job === undefined || r.job === job) && r.at <= minute && minute < r.at + RUN_MINUTES);

/** Your stops and hand-overs on top of the day's tasks. */
export function withTaskControls(tasks: ReadonlyArray<AgentTask>, m: ControlMemory): AgentTask[] {
  return tasks.map((t) => {
    const owner = m.owners[t.id];
    const stoppedAt = m.stopped[t.id];
    const moved = owner ? { ...t, ownerAgentId: owner } : t;
    return stoppedAt !== undefined && moved.status !== 'done' ? { ...moved, status: 'blocked', updatedAt: isoAt(stoppedAt) } : moved;
  });
}

/** Ids for "run now", and the runs you started shown on the jobs. */
export function withJobControls(jobs: Readonly<Record<string, ReadonlyArray<ScheduledJob>>>, m: ControlMemory, minute: number): Record<string, ScheduledJob[]> {
  return Object.fromEntries(Object.entries(jobs).map(([agent, list]) => [agent, list.map((j, i) => {
    const id = jobRef(agent, i);
    const run = m.runs.filter((r) => r.job === id && r.at <= minute).at(-1);
    const shown = run ? { lastRunAt: isoAt(run.at), lastStatus: minute < run.at + RUN_MINUTES ? 'running' : 'ok' } : {};
    return { ...j, id, ...shown };
  })]));
}

/** A bot running a job you started looks busy, unless the script has it doing something else. */
export function withRunPresence(agent: string, p: Presence, m: ControlMemory, minute: number): Presence {
  const run = runningNow(m, agent, minute);
  return run && p.status === 'idle' ? { status: 'working', activity: `Running: ${run.name}`, since: isoAt(run.at) } : p;
}

/** The next office minute at which one of your runs ends. */
export const nextControlChange = (m: ControlMemory, minute: number): number | undefined =>
  m.runs.map((r) => r.at + RUN_MINUTES).filter((x) => x > minute).sort((a, b) => a - b)[0];
