// The Hermes adapter's control verbs with a FAKE runner (never the real CLI): run a cron job now
// (`hermes -p <profile> cron run <id>`), stop a running card (`kanban reclaim` then `kanban block`) and hand a card
// over (`kanban reassign --reclaim`). Each re-reads the board / jobs first and refuses what has moved on. Pause is
// not offered: `hermes pause` is fleet-wide and a per-profile `resume` also lifts the fleet-wide stop.
import { describe, expect, it } from 'vitest';
import { createHermesAdapter } from '../../src/adapters/hermes.ts';
import type { ExecResult, Runner } from '../../src/chat/runner.ts';
import { createFixtureSource, loadFixture, type Fixture } from '../../src/hermes/fixtureSource.ts';
import type { CronJob, KanbanTask } from '../../src/hermes/types.ts';

const base = loadFixture();
const T = Date.parse(base.state.recordedAt) / 1000;
const card = (id: string, assignee: string, status: string): KanbanTask => ({
  id, title: `Card ${id}`, assignee, status, createdBy: 'chief', tenant: null, createdAt: T - 600, startedAt: null, completedAt: null, lastHeartbeatAt: null,
});
const job = (id: string, profile: string, enabled = true): CronJob => ({
  profile, id, name: `Job ${id}`, enabled, schedule: 'every 1h', nextRunAt: null, lastRunAt: null, lastStatus: null,
});
const TASKS = [card('t_run', 'campaigns', 'running'), card('t_ready', 'campaigns', 'ready'), card('t_done', 'campaigns', 'done'), card('t_other', 'tech', 'running')];
const CRON = [job('a1b2c3d4e5f6', 'campaigns'), job('0f0f0f0f0f0f', 'campaigns', false), job('123456789012', 'tech')];

type Opts = { tasks?: KanbanTask[]; cron?: CronJob[]; result?: Partial<ExecResult>; hold?: boolean };

function setup(opts: Opts = {}) {
  const fixture = (): Fixture => ({ ...base, state: { ...base.state, kanban: { ...base.state.kanban, tasks: opts.tasks ?? TASKS }, cron: opts.cron ?? CRON } });
  const calls: string[][] = [];
  const held: Array<(r: ExecResult) => void> = [];
  const done = { stdout: '', stderr: '', code: 0, timedOut: false, ...opts.result };
  const runner: Runner = (file, args) => {
    calls.push([file, ...args]);
    return opts.hold ? new Promise((resolve) => held.push(resolve)) : Promise.resolve(done);
  };
  const source = { kind: 'fixture' as const, readState: async () => (await createFixtureSource({ fixture: fixture() }).readState()), readMessages: async () => ({ ok: false as const, reason: 'none' }) };
  const adapter = createHermesAdapter({ source, runner, hermesBin: '/fake/hermes', now: () => T, cacheTtlMs: 60_000, jobEarlyMs: 20 });
  return { adapter, calls, held };
}

describe('Hermes control verbs', () => {
  it('declares stop, run-job and reassign, and not pause', () => {
    const { adapter } = setup();
    expect(adapter.capabilities).toMatchObject({ pause: false, stop: true, runJob: true, reassign: true });
    expect(adapter.pause).toBeUndefined();
    expect(adapter.resume).toBeUndefined();
  });

  it('reports each job with an opaque id the office can ask it to run', async () => {
    const { adapter } = setup();
    const jobs = (await adapter.snapshot()).jobs?.campaigns ?? [];
    expect(jobs.map((j) => [j.name, j.id, j.enabled])).toEqual([['Job a1b2c3d4e5f6', 'joba1b2c3d4e5f6', true], ['Job 0f0f0f0f0f0f', 'job0f0f0f0f0f0f', false]]);
  });

  it('runs a job now with `hermes -p <profile> cron run <id>`', async () => {
    const { adapter, calls } = setup();
    expect(await adapter.runJob!('campaigns', 'joba1b2c3d4e5f6')).toEqual({ ok: true, value: null });
    expect(calls).toEqual([['/fake/hermes', '-p', 'campaigns', 'cron', 'run', 'a1b2c3d4e5f6']]);
  });

  it('refuses jobs of other bots, paused jobs and odd ids without running anything', async () => {
    const { adapter, calls } = setup();
    expect(await adapter.runJob!('campaigns', 'job123456789012')).toEqual({ ok: false, status: 404, error: 'No such job for this bot' });
    expect(await adapter.runJob!('campaigns', 'job0f0f0f0f0f0f')).toEqual({ ok: false, status: 409, error: 'That job is paused in Hermes (hermes cron resume)' });
    expect(await adapter.runJob!('campaigns', 'a1b2c3d4e5f6')).toEqual({ ok: false, status: 404, error: 'No such job for this bot' });
    expect(await adapter.runJob!('not-a-bot', 'joba1b2c3d4e5f6')).toEqual({ ok: false, status: 404, error: 'No such job for this bot' });
    expect(calls).toEqual([]);
  });

  it('answers at once for a long job, keeps it running in the background, and refuses a second run meanwhile', async () => {
    const { adapter, calls, held } = setup({ hold: true });
    expect(await adapter.runJob!('campaigns', 'joba1b2c3d4e5f6')).toEqual({ ok: true, value: { note: 'Job a1b2c3d4e5f6: started; it runs in the background and shows on the timeline when it is done.' } });
    expect(await adapter.runJob!('campaigns', 'joba1b2c3d4e5f6')).toEqual({ ok: false, status: 409, error: 'That job is already running from the office' });
    held[0]!({ stdout: '', stderr: '', code: 0, timedOut: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(await adapter.runJob!('campaigns', 'joba1b2c3d4e5f6')).toMatchObject({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it('reports a job that fails or times out straight away', async () => {
    expect(await setup({ result: { code: 1 } }).adapter.runJob!('campaigns', 'joba1b2c3d4e5f6')).toEqual({ ok: false, status: 502, error: 'hermes cron run failed' });
    expect(await setup({ result: { code: null, timedOut: true } }).adapter.runJob!('campaigns', 'joba1b2c3d4e5f6')).toEqual({ ok: false, status: 504, error: 'hermes cron run did not answer in time' });
  });

  it('stops the running card: reclaim (ends the worker) then block it so it is not dispatched again', async () => {
    const { adapter, calls } = setup();
    const out = await adapter.stop!('campaigns', {});
    expect(out).toEqual({ ok: true, value: { note: 'Stopped Card t_run and parked it as blocked; unblock it (HR · Approvals) to run it again.' } });
    expect(calls).toEqual([
      ['/fake/hermes', 'kanban', 'reclaim', 't_run', '--reason=Stopped from Dunder Mifflin OS'],
      ['/fake/hermes', 'kanban', 'block', '--kind', 'needs_input', 't_run', 'Stopped from Dunder Mifflin OS; unblock it to run it again'],
    ]);
  });

  it('stops only a card of this bot that is still running', async () => {
    const { adapter, calls } = setup();
    expect(await adapter.stop!('campaigns', { taskId: 't_ready' })).toEqual({ ok: false, status: 409, error: 'That card is not running' });
    expect(await adapter.stop!('campaigns', { taskId: 't_other' })).toEqual({ ok: false, status: 409, error: 'That card is not running' });
    expect(await setup({ tasks: [] }).adapter.stop!('campaigns', {})).toEqual({ ok: false, status: 409, error: 'Nothing of campaigns is running on the board (Hermes can stop kanban cards only)' });
    const two = setup({ tasks: [card('t_a', 'campaigns', 'running'), card('t_b', 'campaigns', 'running')] });
    expect(await two.adapter.stop!('campaigns', {})).toEqual({ ok: false, status: 409, error: 'Several cards are running; stop one from its card' });
    expect(await two.adapter.stop!('campaigns', { taskId: 't_b' })).toMatchObject({ ok: true });
    expect(calls).toEqual([]);
    expect(two.calls.map((c) => c.slice(1, 4))).toEqual([['kanban', 'reclaim', 't_b'], ['kanban', 'block', '--kind']]);
  });

  it('does not park a card whose reclaim failed', async () => {
    const { adapter, calls } = setup({ result: { code: 1 } });
    expect(await adapter.stop!('campaigns', {})).toEqual({ ok: false, status: 502, error: 'hermes kanban reclaim failed' });
    expect(calls).toHaveLength(1);
  });

  it('hands a card to another bot with `kanban reassign --reclaim`', async () => {
    const { adapter, calls } = setup();
    expect(await adapter.reassign!('campaigns', 't_ready', 'tech')).toEqual({ ok: true, value: null });
    expect(calls).toEqual([['/fake/hermes', 'kanban', 'reassign', 't_ready', 'tech', '--reclaim', '--reason=Reassigned from Dunder Mifflin OS']]);
  });

  it('refuses to hand over a card that moved on, or to a profile that is not a bot', async () => {
    const { adapter, calls } = setup();
    expect(await adapter.reassign!('campaigns', 't_done', 'tech')).toEqual({ ok: false, status: 409, error: 'That card has moved on (done or archived, or someone else has it)' });
    expect(await adapter.reassign!('campaigns', 't_other', 'campaigns')).toEqual({ ok: false, status: 400, error: 'Pick another bot' });
    expect(await adapter.reassign!('campaigns', 't_ready', 'none')).toEqual({ ok: false, status: 400, error: 'Pick another bot' });
    expect(await adapter.reassign!('campaigns', '--all', 'tech')).toEqual({ ok: false, status: 404, error: 'No such card' });
    expect(calls).toEqual([]);
  });
});
