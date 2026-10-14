import { describe, expect, it } from 'vitest';
import type { AgentCapabilities, OfficeSnapshot, Person } from '@shared/contract';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { confirmCopy, offeredControls, reassignTargets, runningTasks, stopsCardsOnly } from './controls';

const HERMES: AgentCapabilities = { chat: true, createTask: true, approvals: true, pause: false, stop: true, runJob: true, reassign: true };
const WEBHOOK: AgentCapabilities = { chat: false, createTask: false, approvals: true, pause: true, stop: true, runJob: false, reassign: false };
const dwight = DEMO_SNAPSHOT.people.find((p) => p.id === 'dwight')!;
const withCaps = (p: Person, capabilities: AgentCapabilities, adapter = 'hermes'): Person => ({ ...p, bot: { ...p.bot!, adapter, capabilities } });
const snapshotWith = (people: Person[]): OfficeSnapshot => ({ ...DEMO_SNAPSHOT, people: DEMO_SNAPSHOT.people.map((p) => people.find((x) => x.id === p.id) ?? p) });

describe('offeredControls', () => {
  it('offers exactly what the bot\'s adapter declares, when writes are on', () => {
    expect(offeredControls(withCaps(dwight, HERMES), true)).toEqual({ pause: false, stop: true, runJob: true, reassign: true });
    expect(offeredControls(withCaps(dwight, WEBHOOK, 'webhook'), true)).toEqual({ pause: true, stop: true, runJob: false, reassign: false });
  });

  it('offers nothing read-only, without a bot, or for data that predates control verbs', () => {
    const none = { pause: false, stop: false, runJob: false, reassign: false };
    expect(offeredControls(withCaps(dwight, HERMES), false)).toEqual(none);
    expect(offeredControls(DEMO_SNAPSHOT.people.find((p) => p.id === 'jim')!, true)).toEqual(none);
    expect(offeredControls(dwight, true)).toEqual(none); // no capability flags at all
  });
});

describe('reassignTargets and runningTasks', () => {
  it('hands cards only to other bots of the same adapter', () => {
    const snap = snapshotWith([withCaps(dwight, HERMES), withCaps(DEMO_SNAPSHOT.people.find((p) => p.id === 'kelly')!, WEBHOOK, 'webhook')]);
    const targets = reassignTargets(snap.people.find((p) => p.id === 'dwight')!, snap).map((p) => p.id);
    expect(targets).not.toContain('dwight');
    expect(targets).not.toContain('kelly'); // another adapter
    expect(targets).not.toContain('jim'); // no bot
    expect(targets).toContain('pam');
  });

  it('lists the bot\'s running cards', () => {
    expect(runningTasks(dwight, DEMO_SNAPSHOT).map((t) => t.id)).toEqual(['task-q4-audit']);
  });
});

describe('confirmCopy', () => {
  const ctx = { person: withCaps(dwight, HERMES), snapshot: DEMO_SNAPSHOT };
  it('says what each verb will do before you confirm it', () => {
    expect(confirmCopy({ action: 'pause' }, ctx)).toMatchObject({ title: 'Pause Dwight?', confirm: 'Pause', tone: 'danger' });
    expect(confirmCopy({ action: 'resume' }, ctx)).toMatchObject({ title: 'Resume Dwight?', confirm: 'Resume', tone: 'normal' });
    expect(confirmCopy({ action: 'stop', args: { taskId: 'task-q4-audit' } }, ctx))
      .toMatchObject({ title: 'Stop “Audit the Q4 campaign report”?', confirm: 'Stop it', tone: 'danger' });
    expect(confirmCopy({ action: 'stop' }, ctx)).toMatchObject({ title: 'Stop Dwight’s current run?' });
    expect(confirmCopy({ action: 'run-job', args: { jobId: 'x' } }, { ...ctx, snapshot: { ...DEMO_SNAPSHOT, jobs: { dwight: [{ id: 'x', name: 'Weekly campaign report', schedule: 'Fridays 16:00', enabled: true }] } } }))
      .toMatchObject({ title: 'Run “Weekly campaign report” now?', detail: expect.stringContaining('Fridays 16:00'), confirm: 'Run now' });
    expect(confirmCopy({ action: 'reassign', args: { taskId: 'task-q4-audit', to: 'pam' } }, ctx))
      .toMatchObject({ title: 'Hand “Audit the Q4 campaign report” to Pam?', confirm: 'Reassign' });
    expect(confirmCopy({ action: 'reassign', args: { taskId: 'task-q4-audit', to: '' } }, ctx)).toMatchObject({ title: 'Hand “Audit the Q4 campaign report” to…' });
  });

  it('explains Hermes stops in its own terms (the card is parked, unblock to rerun)', () => {
    expect(confirmCopy({ action: 'stop', args: { taskId: 'task-q4-audit' } }, ctx).detail).toMatch(/parked as blocked/);
    const hook = { person: withCaps(dwight, WEBHOOK, 'claude-code'), snapshot: DEMO_SNAPSHOT };
    expect(confirmCopy({ action: 'stop' }, hook).detail).toMatch(/next step/);
  });
});

describe('stopsCardsOnly', () => {
  it('is true for Hermes and the demo day, which stop kanban cards only', () => {
    expect(stopsCardsOnly(withCaps(dwight, HERMES))).toBe(true);
    expect(stopsCardsOnly(withCaps(dwight, HERMES, 'demo'))).toBe(true);
    expect(stopsCardsOnly(withCaps(dwight, WEBHOOK, 'webhook'))).toBe(false);
  });
});
