// A small, dated price table for ESTIMATING what agents' tokens cost. Never fetched from the network: prices change,
// so every cost the office shows is labelled an estimate along with this table's date. Add or correct models in
// ~/.dunder-mifflin-os/config.yaml under `prices:` (officeConfig.ts) without touching code.
// USD per million tokens. cacheRead / cacheWrite default to 10% / 125% of input when left out (usage/pricing.ts).

export type ModelPrice = {
  readonly input: number;
  readonly output: number;
  readonly cacheRead?: number;
  readonly cacheWrite?: number; // 5-minute cache writes
};

export type PriceTable = {
  readonly asOf: string; // YYYY-MM-DD the prices were checked
  readonly source: string;
  readonly currency: 'USD';
  readonly models: Readonly<Record<string, ModelPrice>>; // keys are normalised model names (pricing.ts normaliseModel)
};

export const BUILT_IN_PRICES: PriceTable = Object.freeze({
  asOf: '2026-10-06',
  source: 'Anthropic API list prices (Claude models, as of 2026-10-06); MiniMax M3 pay-as-you-go rate from public price '
    + 'aggregators (Sep 2026). Other models are unpriced until you add them under `prices:` in config.yaml.',
  currency: 'USD',
  models: Object.freeze({
    'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
    'claude-fable-5': { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
    'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
    'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
    'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
    'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
    'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
    'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
    'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
    'minimax-m3': { input: 0.3, output: 1.2, cacheRead: 0.06 },
  }),
});
