import { describe, expect, it } from 'vitest';
import { BUILT_IN_PRICES } from '../../src/usage/priceTable.ts';
import { combineSummaries, findPrice, mergePriceTables, normaliseModel, priceModel, summariseUsage } from '../../src/usage/pricing.ts';
import type { ModelTokens } from '../../src/adapters/types.ts';
import type { PriceTable } from '../../src/usage/priceTable.ts';

const tokens = (model: string, extra: Partial<ModelTokens> = {}): ModelTokens => ({
  model, inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 2_000_000, cacheWriteTokens: 0, reasoningTokens: 0, calls: 3, ...extra,
});

const TABLE: PriceTable = {
  asOf: '2026-10-06', source: 'test', currency: 'USD',
  models: { 'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }, 'cheap-model': { input: 1, output: 2 } },
};

describe('the built-in price table', () => {
  it('is dated, says where its prices come from and prices the models the fleet uses', () => {
    expect(BUILT_IN_PRICES.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(BUILT_IN_PRICES.source.length).toBeGreaterThan(10);
    expect(BUILT_IN_PRICES.currency).toBe('USD');
    for (const model of ['claude-opus-5-5', 'claude-sonnet-5', 'claude-fable-5-1', 'claude-haiku-5-5', 'MiniMax-M3']) {
      expect(findPrice(BUILT_IN_PRICES, model), model).not.toBeNull();
    }
    for (const p of Object.values(BUILT_IN_PRICES.models)) {
      expect(p.input).toBeGreaterThanOrEqual(0);
      expect(p.output).toBeGreaterThanOrEqual(p.input);
    }
  });
});

describe('normaliseModel / findPrice', () => {
  it('matches provider prefixes, dates, dots and stray suffixes to the same entry', () => {
    expect(normaliseModel('anthropic/claude-opus-5-5')).toBe('claude-opus-5-5');
    expect(normaliseModel('anthropic.claude-opus-5-5')).toBe('claude-opus-5-5');
    expect(normaliseModel('claude-opus-5-5-20260401')).toBe('claude-opus-5-5');
    expect(normaliseModel('claude-fable-5.1 anthropic')).toBe('claude-fable-5-1');
    expect(normaliseModel('MiniMax-M3.1-Flash-Preview')).toBe('minimax-m3-1-flash-preview');
    expect(findPrice(TABLE, 'Claude-Opus-5-5')).toEqual(TABLE.models['claude-opus-5-5']);
    expect(findPrice(TABLE, 'claude-opus-5')).toBeNull(); // no prefix guessing: Opus 5 is not Opus 5.5
  });
});

describe('priceModel', () => {
  it('prices tokens per million with the table, cache reads and writes at their own rates', () => {
    const priced = priceModel(tokens('claude-opus-5-5', { cacheWriteTokens: 100_000 }), TABLE);
    // 1M in × $4 + 0.1M out × $20 + 2M cache reads × $0.20 + 0.1M cache writes × $5
    expect(priced.cost).toBeCloseTo(4 + 2 + 0.4 + 0.5, 6);
    expect(priced).toMatchObject({ model: 'claude-opus-5-5', costSource: 'price-table', calls: 3, inputTokens: 1_000_000 });
  });

  it('defaults cache reads to 10% and writes to 125% of the input price when the table leaves them out', () => {
    const priced = priceModel(tokens('cheap-model', { cacheWriteTokens: 1_000_000 }), TABLE);
    expect(priced.cost).toBeCloseTo(1 + 0.2 + 0.2 + 1.25, 6);
  });

  it('prefers the cost the agent recorded, keeps subscriptions at 0 and leaves unknown models unpriced', () => {
    expect(priceModel(tokens('claude-opus-5-5', { recordedCost: { amount: 1.5, kind: 'actual' } }), TABLE)).toMatchObject({ cost: 1.5, costSource: 'recorded' });
    expect(priceModel(tokens('claude-opus-5-5', { recordedCost: { amount: 2.5, kind: 'estimated' } }), TABLE)).toMatchObject({ cost: 2.5, costSource: 'recorded' });
    expect(priceModel(tokens('claude-opus-5-5', { recordedCost: { amount: 0, kind: 'included' } }), TABLE)).toMatchObject({ cost: 0, costSource: 'included' });
    expect(priceModel(tokens('claude-opus-5-5', { recordedCost: { amount: 0, kind: 'estimated' } }), TABLE)).toMatchObject({ costSource: 'price-table' });
    expect(priceModel(tokens('mystery-model'), TABLE)).toMatchObject({ cost: null, costSource: 'unpriced' });
  });
});

describe('summariseUsage', () => {
  it('adds up tokens and priced costs, lists unpriced models and sorts the biggest spender first', () => {
    const s = summariseUsage([tokens('cheap-model'), tokens('mystery-model'), tokens('claude-opus-5-5')], TABLE);
    expect(s.inputTokens).toBe(3_000_000);
    expect(s.cacheReadTokens).toBe(6_000_000);
    expect(s.cost).toBeCloseTo(6.4 + 1.4, 6);
    expect(s.unpricedModels).toEqual(['mystery-model']);
    expect(s.models.map((m) => m.model)).toEqual(['claude-opus-5-5', 'cheap-model', 'mystery-model']);
  });

  it('says null when there are tokens but no price at all, and 0 when nothing was used', () => {
    expect(summariseUsage([tokens('mystery-model')], TABLE).cost).toBeNull();
    expect(summariseUsage([], TABLE)).toMatchObject({ cost: 0, unpricedModels: [], models: [], inputTokens: 0 });
  });

  it('merges models that normalise to the same name', () => {
    const s = summariseUsage([tokens('claude-opus-5-5'), tokens('anthropic/claude-opus-5-5')], TABLE);
    expect(s.models).toHaveLength(1);
    expect(s.models[0]).toMatchObject({ model: 'claude-opus-5-5', inputTokens: 2_000_000, calls: 6 });
  });
});

describe('mergePriceTables', () => {
  it('lays config prices over the built-in ones and keeps the newer date', () => {
    const merged = mergePriceTables(TABLE, { asOf: '2026-11-01', models: { 'cheap-model': { input: 3, output: 4 }, 'Local-Qwen': { input: 0, output: 0 } } });
    expect(merged.asOf).toBe('2026-11-01');
    expect(merged.source).toMatch(/config/);
    expect(findPrice(merged, 'cheap-model')).toEqual({ input: 3, output: 4 });
    expect(findPrice(merged, 'local-qwen')).toEqual({ input: 0, output: 0 });
    expect(findPrice(merged, 'claude-opus-5-5')).not.toBeNull();
    expect(mergePriceTables(TABLE, undefined)).toBe(TABLE);
  });
});

describe('combineSummaries', () => {
  it('adds rows into totals, model by model, keeping unpriced models visible', () => {
    const a = summariseUsage([tokens('claude-opus-5-5'), tokens('mystery-model')], TABLE);
    const b = summariseUsage([tokens('claude-opus-5-5', { inputTokens: 0 })], TABLE);
    const total = combineSummaries([a, b]);
    expect(total.inputTokens).toBe(2_000_000);
    expect(total.cost).toBeCloseTo(6.4 + 2.4, 6);
    expect(total.unpricedModels).toEqual(['mystery-model']);
    expect(total.models.map((m) => [m.model, m.inputTokens])).toEqual([['claude-opus-5-5', 1_000_000], ['mystery-model', 1_000_000]]);
    expect(combineSummaries([])).toMatchObject({ cost: 0, models: [], inputTokens: 0 });
    expect(combineSummaries([summariseUsage([tokens('mystery-model')], TABLE)]).cost).toBeNull();
  });
});
