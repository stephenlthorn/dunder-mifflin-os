// `budgets:` in ~/.dunder-mifflin-os/config.yaml: per-person daily/monthly USD limits plus autoPause (default false).
import { describe, expect, it } from 'vitest';
import { parseBudgets } from '../../src/budgets/config.ts';
import { parseOfficeConfig } from '../../src/officeConfig.ts';

describe('parseBudgets', () => {
  it('reads limits per person, autoPause off by default', () => {
    expect(parseBudgets({ dwight: { monthly: 20 }, kelly: { daily: 1.5, monthly: 30 } })).toEqual({
      ok: true, value: { autoPause: false, limits: { dwight: { monthly: 20 }, kelly: { daily: 1.5, monthly: 30 } } },
    });
    expect(parseBudgets({ autoPause: true, dwight: { daily: 2 } })).toEqual({ ok: true, value: { autoPause: true, limits: { dwight: { daily: 2 } } } });
  });

  it('accepts temps (agents at spare desks) by their person id', () => {
    expect(parseBudgets({ 'temp-webhook-deploy-bot': { monthly: 5 } })).toMatchObject({ ok: true });
  });

  it('refuses mistakes with the field named', () => {
    expect(parseBudgets([])).toEqual({ ok: false, error: 'budgets: expected a mapping like { dwight: { monthly: 20 } }' });
    expect(parseBudgets({ autoPause: 'yes' })).toEqual({ ok: false, error: 'budgets.autoPause: true or false' });
    expect(parseBudgets({ dwigth: { monthly: 20 } })).toEqual({ ok: false, error: 'budgets.dwigth: "dwigth" is not a character (see shared/office/staff.ts)' });
    expect(parseBudgets({ dwight: 20 })).toEqual({ ok: false, error: 'budgets.dwight: expected { daily, monthly } in USD' });
    expect(parseBudgets({ dwight: {} })).toEqual({ ok: false, error: 'budgets.dwight: give a daily or a monthly limit (USD)' });
    expect(parseBudgets({ dwight: { weekly: 5 } })).toEqual({ ok: false, error: 'budgets.dwight: unknown field "weekly" (expected daily, monthly)' });
    for (const bad of [0, -1, Number.NaN, '20', 2_000_000]) {
      expect(parseBudgets({ dwight: { monthly: bad } })).toEqual({ ok: false, error: 'budgets.dwight.monthly: a number of USD above 0 (at most 1000000)' });
    }
  });
});

describe('budgets in config.yaml', () => {
  it('are optional and parsed with the rest of the config', () => {
    expect(parseOfficeConfig({ adapters: ['hermes'] }, 'config.yaml').budgets).toBeUndefined();
    expect(parseOfficeConfig({ budgets: { autoPause: true, dwight: { monthly: 20 } } }, 'config.yaml').budgets)
      .toEqual({ autoPause: true, limits: { dwight: { monthly: 20 } } });
    expect(() => parseOfficeConfig({ budgets: { dwight: { monthly: -5 } } }, 'config.yaml')).toThrow('config.yaml: budgets.dwight.monthly');
  });
});
