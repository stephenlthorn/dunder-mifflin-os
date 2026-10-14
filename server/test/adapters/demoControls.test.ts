// The demo day ("Threat Level Midnight") takes the control verbs in memory: stop a running card (parked as blocked),
// run a scheduled job now, hand a card to another demo bot. No pause, like Hermes. Everything resets when the day
// loops. Its scripted usage feeds Corporate's budgets: estimated cost per bot, one bot on a model nobody can price.
import { afterEach, describe, expect, it } from 'vitest';
import { createDemoAdapter, type DemoAdapter } from '../../src/adapters/demo/adapter.ts';
import { DEMO_BUDGETS } from '../../src/adapters/demo/usage.ts';
import { summariseUsage } from '../../src/usage/pricing.ts';
import { BUILT_IN_PRICES } from '../../src/usage/priceTable.ts';
import { budgetWindow } from '../../src/budgets/periods.ts';
import { hm } from '../../../shared/demo/time.ts';

const T0 = Date.parse('2026-10-13T15:00:00.000Z');
const opened: DemoAdapter[] = [];
afterEach(async () => { await Promise.all(opened.splice(0).map((a) => a.close?.())); });

function demo(start: string) {
  let t = T0;
  const adapter = createDemoAdapter({ start: hm(start), speed: 60, seed: 1, now: () => t, replyDelayMs: 0 });
  opened.push(adapter);
  return { adapter, advance: (ms: number) => { t += ms; }, now: () => t };
}

describe('demo control verbs', () => {
  it('declares stop, run-job and reassign, not pause', () => {
    const { adapter } = demo('10:45');
    expect(adapter.capabilities).toMatchObject({ chat: true, createTask: true, pause: false, stop: true, runJob: true, reassign: true });
    expect(adapter.pause).toBeUndefined();
  });

  it('gives each job an id and runs one now: running for a few office minutes, then ok', async () => {
    const { adapter, advance } = demo('10:45');
    const job = (await adapter.snapshot()).jobs?.it?.[0];
    expect(job).toMatchObject({ id: 'job-it-0', name: 'Fleet health check' });
    expect(await adapter.runJob!('it', 'job-it-0')).toEqual({ ok: true, value: null });
    const during = await adapter.snapshot();
    expect(during.jobs?.it?.[0]).toMatchObject({ lastStatus: 'running' });
    expect(await adapter.runJob!('it', 'job-it-0')).toEqual({ ok: false, status: 409, error: 'That job is already running' });
    advance(6000); // 6 office minutes at 60x
    expect((await adapter.snapshot()).jobs?.it?.[0]).toMatchObject({ lastStatus: 'ok' });
  });

  it('refuses unknown or switched-off jobs', async () => {
    const { adapter } = demo('10:45');
    expect(await adapter.runJob!('it', 'job-it-9')).toEqual({ ok: false, status: 404, error: 'No such job for this bot' });
    expect(await adapter.runJob!('sales', 'job-it-0')).toEqual({ ok: false, status: 404, error: 'No such job for this bot' });
    expect(await adapter.runJob!('strategy', 'job-strategy-0')).toEqual({ ok: false, status: 409, error: 'That job is switched off' });
  });

  it('stops a running card: parked as blocked for the rest of the day', async () => {
    const { adapter } = demo('10:45');
    expect(await adapter.stop!('manager', { taskId: 'demo-tasks-x' })).toEqual({ ok: false, status: 409, error: 'That card is not running' });
    expect(await adapter.stop!('manager', { taskId: 'demo-pricing' }))
      .toEqual({ ok: true, value: { note: 'Stopped “Q4 pricing review”; it stays parked as blocked for the rest of the demo day.' } });
    expect((await adapter.snapshot()).tasks.find((t) => t.id === 'demo-pricing')).toMatchObject({ status: 'blocked' });
    expect(await adapter.stop!('manager', {})).toMatchObject({ ok: false, status: 409 });
  });

  it('hands a card to another demo bot, and only to one', async () => {
    const { adapter } = demo('10:45');
    expect(await adapter.reassign!('manager', 'demo-pricing', 'manager')).toEqual({ ok: false, status: 400, error: 'Pick another demo bot' });
    expect(await adapter.reassign!('manager', 'demo-pricing', 'nobody')).toEqual({ ok: false, status: 400, error: 'Pick another demo bot' });
    expect(await adapter.reassign!('sales', 'demo-pricing', 'analyst')).toEqual({ ok: false, status: 409, error: 'That card is not this bot’s, or it is done' });
    expect(await adapter.reassign!('manager', 'demo-pricing', 'analyst')).toEqual({ ok: true, value: null });
    expect((await adapter.snapshot()).tasks.find((t) => t.id === 'demo-pricing')).toMatchObject({ ownerAgentId: 'analyst' });
  });

  it('forgets every change when the day loops', async () => {
    const { adapter, advance } = demo('10:45');
    await adapter.stop!('manager', { taskId: 'demo-pricing' });
    advance(60_000 * 8); // eight office hours: past 17:30, so it's 09:45 of the next day
    expect((await adapter.snapshot()).tasks.find((t) => t.id === 'demo-pricing')).toMatchObject({ status: 'todo', ownerAgentId: 'manager' });
    advance(50_000); // 10:35: the Council has started again
    expect((await adapter.snapshot()).tasks.find((t) => t.id === 'demo-pricing')).toMatchObject({ status: 'doing', ownerAgentId: 'manager' });
  });
});

describe('demo usage for Corporate', () => {
  const today = (adapter: DemoAdapter, now: number) => adapter.usage!('social', budgetWindow('daily', now));

  it('spends through the office day: more in the afternoon than in the morning', async () => {
    const morning = demo('09:30');
    const afternoon = demo('16:30');
    const cost = async (d: ReturnType<typeof demo>) => summariseUsage((await today(d.adapter, d.now()))!.models, BUILT_IN_PRICES).cost!;
    expect(await cost(morning)).toBeLessThan(await cost(afternoon));
    expect(await cost(afternoon)).toBeGreaterThan(DEMO_BUDGETS.limits.kelly!.daily!); // Kelly is over her daily budget by late afternoon
  });

  it('has one bot on a model nobody can price', async () => {
    const d = demo('14:00');
    const usage = await d.adapter.usage!('imports', budgetWindow('daily', d.now()));
    expect(summariseUsage(usage!.models, BUILT_IN_PRICES)).toMatchObject({ cost: null, unpricedModels: ['chili-7b-local'] });
  });

  it('counts the days before today in a monthly window, and knows no other agents', async () => {
    const d = demo('12:00');
    const month = await d.adapter.usage!('manager', budgetWindow('monthly', d.now()));
    const day = await d.adapter.usage!('manager', budgetWindow('daily', d.now()));
    expect(month!.models[0]!.inputTokens).toBeGreaterThanOrEqual(day!.models[0]!.inputTokens);
    expect(await d.adapter.usage!('nobody', budgetWindow('daily', d.now()))).toBeNull();
  });

  it('budgets for the demo: no auto-pause, a mix of daily and monthly limits', () => {
    expect(DEMO_BUDGETS.autoPause).toBe(false);
    expect(Object.keys(DEMO_BUDGETS.limits).sort()).toEqual(['dwight', 'kelly', 'kevin', 'michael']);
  });
});
