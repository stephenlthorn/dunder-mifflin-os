// "Corporate": the budget monitor reads each budgeted bot's usage for the day and the month, and at 100% freezes the
// expense account: it pauses the bot ONLY when budgets.autoPause is true AND the bot's adapter can pause; otherwise it
// just alerts. Unpriced usage never pauses. One attempt per bot per period window. Fakes only.
import { describe, expect, it } from 'vitest';
import type { AgentCapabilities, Person } from '../../../shared/contract.ts';
import type { UsageRow, UsageSummary } from '../../../shared/observability.ts';
import type { BudgetConfig } from '../../src/budgets/config.ts';
import { createBudgetMonitor } from '../../src/budgets/monitor.ts';
import { budgetWindow } from '../../src/budgets/periods.ts';
import type { ControlOutcome } from '../../src/office/controls.ts';

const local = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h).getTime();
const CAN: AgentCapabilities = { chat: true, createTask: true, approvals: true, pause: true, stop: true };
const CANNOT: AgentCapabilities = { ...CAN, pause: false };
const look = { skin: '#fff', hair: '#000', hairStyle: 'short' as const, shirt: '#fff' };
const person = (id: string, name: string, caps?: AgentCapabilities): Person => ({
  id, name, title: 'Sales', seatId: `seat.${id}`, look, ...(caps ? { bot: { profile: id, role: 'Sales', adapter: 'fake', capabilities: caps } } : {}),
});
const PEOPLE = [person('dwight', 'Dwight Schrute', CAN), person('jim', 'Jim Halpert', CANNOT), person('kevin', 'Kevin Malone')];

const summary = (cost: number | null, unpriced: string[] = []): UsageSummary => ({
  inputTokens: 10, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, cost, unpricedModels: unpriced, models: [],
});

type Spend = Record<string, { daily?: UsageSummary | null; monthly?: UsageSummary | null }>;

function harness(config: BudgetConfig, spend: Spend, opts: { pauseFails?: string } = {}) {
  const clock = { now: local(2026, 10, 13, 15) };
  const paused: string[] = [];
  const reads: string[] = [];
  const monitor = createBudgetMonitor({
    config,
    people: async () => PEOPLE,
    usageIn: async (personId, window): Promise<UsageRow | null> => {
      const period = window.from === budgetWindow('daily', clock.now).from ? 'daily' : 'monthly'; // tests never run on the 1st
      reads.push(`${personId}:${period}`);
      const usage = spend[personId]?.[period];
      if (usage === undefined) return null;
      return { personId, name: personId, adapterId: 'fake', adapterLabel: 'Fake', usage, ...(usage === null ? { unavailable: 'No usage data from Fake' } : {}) };
    },
    pause: async (personId, reason): Promise<ControlOutcome> => {
      paused.push(`${personId}: ${reason}`);
      return opts.pauseFails ? { ok: false, status: 403, error: opts.pauseFails } : { ok: true, value: { ok: true, action: 'pause', message: 'Paused.' } };
    },
    nowMs: () => clock.now,
    cacheMs: 0,
  });
  return { monitor, paused, reads, clock };
}

describe('the budget monitor ("Corporate")', () => {
  it('pauses a bot at 100% when autoPause is on and its adapter can pause, once per period', async () => {
    const h = harness({ autoPause: true, limits: { dwight: { monthly: 20 } } }, { dwight: { monthly: summary(21) } });
    const report = await h.monitor.check();
    expect(h.paused).toEqual(['dwight: Over its monthly budget ($21.00 of $20.00)']);
    expect(report.budgets[0]).toMatchObject({ personId: 'dwight', name: 'Dwight Schrute', level: 'over', action: 'paused', note: expect.stringMatching(/^Corporate froze the expense account/) });
    await h.monitor.check();
    expect(h.paused).toHaveLength(1); // not again in the same month
    h.clock.now = local(2026, 11, 2, 9); // a new month, still over
    await h.monitor.check();
    expect(h.paused).toHaveLength(2);
  });

  it('only alerts when autoPause is off (the default)', async () => {
    const h = harness({ autoPause: false, limits: { dwight: { monthly: 20 } } }, { dwight: { monthly: summary(25) } });
    const report = await h.monitor.check();
    expect(h.paused).toEqual([]);
    expect(report).toMatchObject({ autoPause: false, warnAt: 0.8, currency: 'USD', estimate: true });
    expect(report.budgets[0]).toMatchObject({ level: 'over', action: 'alert', note: 'Auto-pause is off (budgets.autoPause in config.yaml)' });
  });

  it('only alerts when the bot\'s adapter cannot pause', async () => {
    const h = harness({ autoPause: true, limits: { jim: { daily: 1 } } }, { jim: { daily: summary(3) } });
    const report = await h.monitor.check();
    expect(h.paused).toEqual([]);
    expect(report.budgets[0]).toMatchObject({ personId: 'jim', level: 'over', action: 'alert', note: "Fake agents can't be paused; Corporate can only call you" });
  });

  it('never pauses for unpriced usage, and says what it can\'t price', async () => {
    const h = harness({ autoPause: true, limits: { dwight: { daily: 0.01, monthly: 0.01 } } },
      { dwight: { daily: summary(null, ['mystery-model']), monthly: summary(null, ['mystery-model']) } });
    const report = await h.monitor.check();
    expect(h.paused).toEqual([]);
    expect(report.budgets[0]).toMatchObject({ level: 'unpriced', action: 'none' });
    expect(report.budgets[0]!.lines.map((l) => [l.period, l.spent, l.unpricedModels])).toEqual([['daily', null, ['mystery-model']], ['monthly', null, ['mystery-model']]]);
  });

  it('warns from 80% without acting', async () => {
    const h = harness({ autoPause: true, limits: { dwight: { monthly: 20 } } }, { dwight: { monthly: summary(17) } });
    expect((await h.monitor.check()).budgets[0]).toMatchObject({ level: 'warn', action: 'none' });
    expect(h.paused).toEqual([]);
  });

  it('turns a failed pause into an alert with the reason, and does not retry it in the same period', async () => {
    const h = harness({ autoPause: true, limits: { dwight: { monthly: 20 } } }, { dwight: { monthly: summary(30) } }, { pauseFails: 'Read-only mode' });
    expect((await h.monitor.check()).budgets[0]).toMatchObject({ action: 'alert', note: 'Could not pause: Read-only mode' });
    expect((await h.monitor.check()).budgets[0]).toMatchObject({ action: 'alert', note: 'Could not pause: Read-only mode' });
    expect(h.paused).toHaveLength(1);
  });

  it('lists people without a bot or without usage data as such, worst first', async () => {
    const h = harness({ autoPause: false, limits: { kevin: { monthly: 5 }, jim: { monthly: 5 }, dwight: { monthly: 20 } } },
      { jim: { monthly: null }, dwight: { monthly: summary(18) } });
    const report = await h.monitor.check();
    expect(report.budgets.map((b) => [b.personId, b.level])).toEqual([['dwight', 'warn'], ['jim', 'no-data'], ['kevin', 'no-data']]);
    expect(report.budgets.find((b) => b.personId === 'kevin')).toMatchObject({ unavailable: 'No bot at this desk' });
    expect(report.budgets.find((b) => b.personId === 'jim')).toMatchObject({ unavailable: 'No usage data from Fake' });
  });

  it('reads each budgeted period once per check, and nothing at all without budgets', async () => {
    const h = harness({ autoPause: false, limits: { dwight: { daily: 1, monthly: 20 } } }, { dwight: { daily: summary(0.1), monthly: summary(2) } });
    await h.monitor.check();
    expect(h.reads.sort()).toEqual(['dwight:daily', 'dwight:monthly']);
    const none = harness({ autoPause: true, limits: {} }, {});
    expect((await none.monitor.check()).budgets).toEqual([]);
    expect(none.reads).toEqual([]);
  });
});
