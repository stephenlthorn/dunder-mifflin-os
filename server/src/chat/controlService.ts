// Hermes control verbs, researched against the Hermes CLI's help and source, read only:
//  - run a job now: `hermes -p <profile> cron run <id>` runs the job to the end in the CLI process (minutes for an
//    agent job), so the office answers after a short wait and lets it finish in the background (one per job);
//  - stop: Hermes can stop KANBAN cards only (no CLI stops a Telegram turn): `kanban reclaim` ends the card's worker
//    and releases its claim, then `kanban block --kind needs_input` parks it so the dispatcher doesn't start it again;
//    it then waits on you in HR · Approvals ("Unblock" runs it again);
//  - reassign: `kanban reassign <card> <profile> --reclaim` (stops its run first when it is running).
// Pause/resume are NOT offered: `hermes pause` is the fleet-wide emergency stop; `hermes -p <p> pause` writes a
// per-profile sentinel, but `-p <p> resume` deletes the fleet-wide one too, and kanban dispatch runs in a single
// gateway, so a per-profile pause would either not stop cards reaching the bot or stop them for every bot.
// Every verb re-reads Hermes first (never the cache) and refuses what has moved on. execFile, no shell; argv holds
// only validated ids and fixed text. Logs the verb and the exit code, never the CLI's output.
import type { ActionError, ControlResult } from '../adapters/types.ts';
import { jobIdOf, maskJobText } from '../domain/jobs.ts';
import { scrubText } from '../domain/scrub.ts';
import type { HermesState } from '../hermes/types.ts';
import { log, redact } from '../log.ts';
import { isBotProfile } from '../roster.ts';
import { buildCronRunArgs, buildReassignArgs, buildStopArgs } from './commands.ts';
import type { Runner } from './runner.ts';

export type HermesControlOptions = {
  readonly runner: Runner;
  readonly hermesBin: string;
  readonly timeoutMs: number; // kanban commands
  readonly jobTimeoutMs: number; // a whole cron run
  readonly earlyMs?: number; // how long to wait for a job before answering "started"
  readonly readFresh: () => Promise<HermesState>;
};

const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const OPEN: ReadonlySet<string> = new Set(['triage', 'todo', 'ready', 'scheduled', 'running', 'review', 'blocked']);
const DEFAULT_EARLY_MS = 4000;
const fail = (status: ActionError['status'], error: string): ActionError => ({ ok: false, status, error });

export function createHermesControls(opts: HermesControlOptions) {
  let running: ReadonlySet<string> = new Set(); // jobs started from the office that haven't finished

  async function exec(args: ReadonlyArray<string>, what: string, timeoutMs: number): Promise<ControlResult> {
    try {
      const res = await opts.runner(opts.hermesBin, args, { timeoutMs });
      log('control.hermes', { verb: what, code: res.code, timedOut: res.timedOut });
      if (res.timedOut) return fail(504, `hermes ${what} did not answer in time`);
      return res.code === 0 ? { ok: true, value: null } : fail(502, `hermes ${what} failed`);
    } catch (error) {
      log('control.hermes_error', { verb: what, detail: redact(error instanceof Error ? error.message : String(error)) });
      return fail(502, 'Could not start the hermes CLI');
    }
  }

  async function runJob(profile: string, ref: string): Promise<ControlResult> {
    const id = jobIdOf(ref);
    const job = id && isBotProfile(profile) ? (await opts.readFresh()).cron.find((j) => j.profile === profile && j.id === id) : undefined;
    if (!job) return fail(404, 'No such job for this bot');
    if (!job.enabled) return fail(409, 'That job is paused in Hermes (hermes cron resume)');
    const key = `${profile}/${job.id}`;
    if (running.has(key)) return fail(409, 'That job is already running from the office');
    running = new Set([...running, key]);
    const finished = exec(buildCronRunArgs(profile, job.id), 'cron run', opts.jobTimeoutMs)
      .finally(() => { running = new Set([...running].filter((k) => k !== key)); });
    let timer: NodeJS.Timeout | undefined;
    const later = new Promise<'later'>((resolve) => { timer = setTimeout(() => resolve('later'), opts.earlyMs ?? DEFAULT_EARLY_MS); });
    const first = await Promise.race([finished, later]);
    clearTimeout(timer);
    if (first !== 'later') return first;
    return { ok: true, value: { note: `${maskJobText(job.name)}: started; it runs in the background and shows on the timeline when it is done.` } };
  }

  async function stop(profile: string, target?: { readonly taskId?: string }): Promise<ControlResult> {
    const taskId = target?.taskId;
    if (taskId !== undefined && !TASK_ID.test(taskId)) return fail(404, 'No such card');
    const mine = (await opts.readFresh()).kanban.tasks.filter((t) => t.assignee === profile && t.status === 'running');
    const card = taskId ? mine.find((t) => t.id === taskId) : mine.length === 1 ? mine[0] : undefined;
    if (taskId && !card) return fail(409, 'That card is not running');
    if (!mine.length) return fail(409, `Nothing of ${profile} is running on the board (Hermes can stop kanban cards only)`);
    if (!card) return fail(409, 'Several cards are running; stop one from its card');
    const [reclaim, block] = buildStopArgs(card.id);
    const reclaimed = await exec(reclaim!, 'kanban reclaim', opts.timeoutMs);
    if (!reclaimed.ok) return reclaimed;
    const parked = await exec(block!, 'kanban block', opts.timeoutMs);
    if (!parked.ok) return fail(502, 'Stopped the run, but could not park the card; Hermes may start it again (hermes kanban block)');
    return { ok: true, value: { note: `Stopped ${scrubText(card.title)} and parked it as blocked; unblock it (HR · Approvals) to run it again.` } };
  }

  async function reassign(profile: string, taskId: string, toProfile: string): Promise<ControlResult> {
    if (toProfile === profile || !isBotProfile(toProfile)) return fail(400, 'Pick another bot');
    if (!TASK_ID.test(taskId)) return fail(404, 'No such card');
    const card = (await opts.readFresh()).kanban.tasks.find((t) => t.id === taskId && t.assignee === profile && OPEN.has(t.status));
    if (!card) return fail(409, 'That card has moved on (done or archived, or someone else has it)');
    return exec(buildReassignArgs(card.id, toProfile), 'kanban reassign', opts.timeoutMs);
  }

  return { runJob, stop, reassign };
}
