// `prices:` in ~/.dunder-mifflin-os/config.yaml: add or correct model prices for the ledger's estimates.
//
//   prices:
//     asOf: 2026-11-01                     # when you checked them (optional)
//     models:                              # USD per million tokens
//       MiniMax-M3.1-Flash-Preview: { input: 0.3, output: 1.2, cacheRead: 0.06 }
//       my-local-model: { input: 0, output: 0 }
import type { ModelPrice } from './priceTable.ts';
import type { ConfigPrices } from './pricing.ts';
import { isRecord } from '../hermes/guards.ts';

const MODEL = /^[\w.:/-]{1,120}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRICE_KEYS = ['input', 'output', 'cacheRead', 'cacheWrite'] as const;
const MAX_PRICE = 10_000;

class PriceError extends Error {}

function price(raw: unknown, where: string): ModelPrice {
  if (!isRecord(raw)) throw new PriceError(`${where}: expected { input, output } in USD per million tokens`);
  const extra = Object.keys(raw).find((k) => !(PRICE_KEYS as ReadonlyArray<string>).includes(k));
  if (extra) throw new PriceError(`${where}: unknown field "${extra.slice(0, 40)}" (expected ${PRICE_KEYS.join(', ')})`);
  const read = (key: (typeof PRICE_KEYS)[number], required: boolean): number | undefined => {
    const v = raw[key];
    if (v === undefined && !required) return undefined;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_PRICE) throw new PriceError(`${where}.${key}: a number of USD per million tokens, 0 or more`);
    return v;
  };
  const cacheRead = read('cacheRead', false);
  const cacheWrite = read('cacheWrite', false);
  return { input: read('input', true)!, output: read('output', true)!, ...(cacheRead === undefined ? {} : { cacheRead }), ...(cacheWrite === undefined ? {} : { cacheWrite }) };
}

export function parsePrices(raw: unknown): { ok: true; value: ConfigPrices } | { ok: false; error: string } {
  try {
    if (!isRecord(raw)) throw new PriceError('prices: expected { asOf, models }');
    const extra = Object.keys(raw).find((k) => k !== 'asOf' && k !== 'models');
    if (extra) throw new PriceError(`prices: unknown field "${extra.slice(0, 40)}" (expected asOf, models; prices are in USD)`);
    if (raw.asOf !== undefined && (typeof raw.asOf !== 'string' || !DATE.test(raw.asOf))) throw new PriceError('prices.asOf: a date like 2026-11-01');
    if (!isRecord(raw.models)) throw new PriceError('prices.models: expected a mapping of model name -> { input, output }');
    const models = Object.fromEntries(Object.entries(raw.models).map(([name, p]) => {
      if (!MODEL.test(name)) throw new PriceError(`prices.models: "${name.slice(0, 40)}" is not a model name`);
      return [name, price(p, `prices.models.${name}`)];
    }));
    return { ok: true, value: { ...(typeof raw.asOf === 'string' ? { asOf: raw.asOf } : {}), models } };
  } catch (error) {
    if (error instanceof PriceError) return { ok: false, error: error.message };
    throw error;
  }
}
