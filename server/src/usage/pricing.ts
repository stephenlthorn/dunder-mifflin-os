// Tokens -> estimated cost. Pure. A model's cost is, in order of preference: what the agent itself recorded (Hermes'
// actual or estimated cost columns), 0 when the agent says a subscription covers it, our dated price table, or
// "unpriced" (null), which the ledger shows instead of a made-up zero.
import type { ModelUsage, UsageSummary } from '../../../shared/observability.ts';
import type { ModelTokens } from '../adapters/types.ts';
import type { ModelPrice, PriceTable } from './priceTable.ts';

/** `prices:` from config.yaml, already validated: raw model names -> prices, plus an optional date. */
export type ConfigPrices = { readonly asOf?: string; readonly models: Readonly<Record<string, ModelPrice>> };

const PER_MILLION = 1_000_000;
/** Costs to a millionth of a dollar: no float noise like 0.30000000000000004 in the API. */
const usd = (n: number) => Math.round(n * 1e6) / 1e6;
const DEFAULT_CACHE_READ = 0.1; // × input, when the table doesn't say
const DEFAULT_CACHE_WRITE = 1.25;

/** 'anthropic/Claude-Fable-5.1 x' -> 'claude-fable-5-1': lower case, no provider prefix, date suffix or stray words. */
export function normaliseModel(model: string): string {
  return model.trim().toLowerCase()
    .split(/\s+/)[0]!
    .replace(/^(?:anthropic|openai|minimax|google|meta|mistral|us\.anthropic)[./]/, '')
    .replace(/\./g, '-')
    .replace(/-\d{8}$/, '');
}

export function findPrice(table: PriceTable, model: string): ModelPrice | null {
  return table.models[normaliseModel(model)] ?? null;
}

function tableCost(t: ModelTokens, p: ModelPrice): number {
  const cacheRead = p.cacheRead ?? p.input * DEFAULT_CACHE_READ;
  const cacheWrite = p.cacheWrite ?? p.input * DEFAULT_CACHE_WRITE;
  return (t.inputTokens * p.input + t.outputTokens * p.output + t.cacheReadTokens * cacheRead + t.cacheWriteTokens * cacheWrite) / PER_MILLION;
}

export function priceModel(t: ModelTokens, table: PriceTable): ModelUsage {
  const base = {
    model: t.model, inputTokens: t.inputTokens, outputTokens: t.outputTokens, cacheReadTokens: t.cacheReadTokens, cacheWriteTokens: t.cacheWriteTokens,
    ...(t.calls === undefined ? {} : { calls: t.calls }),
  };
  const recorded = t.recordedCost;
  if (recorded?.kind === 'included') return { ...base, cost: 0, costSource: 'included' };
  if (recorded && recorded.amount > 0) return { ...base, cost: usd(recorded.amount), costSource: 'recorded' };
  const price = findPrice(table, t.model);
  return price ? { ...base, cost: usd(tableCost(t, price)), costSource: 'price-table' } : { ...base, cost: null, costSource: 'unpriced' };
}

const totalTokens = (m: ModelTokens | ModelUsage) => m.inputTokens + m.outputTokens + m.cacheReadTokens + m.cacheWriteTokens;
const addOpt = (a: number | undefined, b: number | undefined) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0));

function addCost(a: ModelTokens['recordedCost'], b: ModelTokens['recordedCost']): ModelTokens['recordedCost'] {
  if (!a || !b) return a ?? b;
  if (a.kind === 'included' && b.kind === 'included') return a;
  const rank = { actual: 2, estimated: 1, included: 0 } as const;
  return { amount: a.amount + b.amount, kind: rank[a.kind] >= rank[b.kind] ? a.kind : b.kind };
}

/** Rows naming the same model (after normalising) become one. */
function mergeSameModel(rows: ReadonlyArray<ModelTokens>): ModelTokens[] {
  const byName = rows.reduce((acc, r) => {
    const key = normaliseModel(r.model);
    const prev = acc.get(key);
    if (!prev) return new Map([...acc, [key, { ...r, model: key }]]);
    const calls = addOpt(prev.calls, r.calls);
    const recordedCost = addCost(prev.recordedCost, r.recordedCost);
    const merged: ModelTokens = {
      model: key, inputTokens: prev.inputTokens + r.inputTokens, outputTokens: prev.outputTokens + r.outputTokens,
      cacheReadTokens: prev.cacheReadTokens + r.cacheReadTokens, cacheWriteTokens: prev.cacheWriteTokens + r.cacheWriteTokens,
      reasoningTokens: prev.reasoningTokens + r.reasoningTokens,
      ...(calls === undefined ? {} : { calls }), ...(recordedCost ? { recordedCost } : {}),
    };
    return new Map([...acc, [key, merged]]);
  }, new Map<string, ModelTokens>());
  return [...byName.values()];
}

export function summariseUsage(rows: ReadonlyArray<ModelTokens>, table: PriceTable): UsageSummary {
  const models = mergeSameModel(rows).map((r) => priceModel(r, table))
    .sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1) || totalTokens(b) - totalTokens(a));
  const sum = (key: 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens') => models.reduce((n, m) => n + m[key], 0);
  const priced = models.filter((m) => m.cost !== null);
  const unpricedModels = models.filter((m) => m.cost === null && totalTokens(m) > 0).map((m) => m.model);
  const cost = priced.length || !unpricedModels.length ? usd(priced.reduce((n, m) => n + (m.cost ?? 0), 0)) : null;
  return {
    inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), cacheReadTokens: sum('cacheReadTokens'), cacheWriteTokens: sum('cacheWriteTokens'),
    cost, unpricedModels, models,
  };
}

export function mergePriceTables(base: PriceTable, config: ConfigPrices | undefined): PriceTable {
  if (!config) return base;
  const models = Object.fromEntries(Object.entries(config.models).map(([name, price]) => [normaliseModel(name), price]));
  return {
    asOf: config.asOf && config.asOf > base.asOf ? config.asOf : base.asOf,
    source: `${base.source} Plus ${Object.keys(models).length} price(s) from config.yaml.`,
    currency: base.currency,
    models: { ...base.models, ...models },
  };
}

function addModel(a: ModelUsage, b: ModelUsage): ModelUsage {
  const calls = addOpt(a.calls, b.calls);
  const cost = a.cost === null && b.cost === null ? null : usd((a.cost ?? 0) + (b.cost ?? 0));
  return {
    model: a.model, inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens, cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    ...(calls === undefined ? {} : { calls }), cost, costSource: a.costSource === b.costSource ? a.costSource : (cost === null ? 'unpriced' : 'price-table'),
  };
}

/** Several bots' summaries -> the ledger's totals, model by model. */
export function combineSummaries(parts: ReadonlyArray<UsageSummary>): UsageSummary {
  const byModel = parts.flatMap((p) => p.models).reduce((acc, m) => {
    const prev = acc.get(m.model);
    return new Map([...acc, [m.model, prev ? addModel(prev, m) : m]]);
  }, new Map<string, ModelUsage>());
  const models = [...byModel.values()].sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1) || totalTokens(b) - totalTokens(a));
  const priced = parts.filter((p) => p.cost !== null);
  const unpricedModels = [...new Set(parts.flatMap((p) => p.unpricedModels))];
  const sum = (key: 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens') => parts.reduce((n, p) => n + p[key], 0);
  return {
    inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), cacheReadTokens: sum('cacheReadTokens'), cacheWriteTokens: sum('cacheWriteTokens'),
    cost: priced.length || !parts.length ? usd(priced.reduce((n, p) => n + (p.cost ?? 0), 0)) : null,
    unpricedModels, models,
  };
}
