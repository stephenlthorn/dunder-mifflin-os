// Live check of the timeline and usage reads against the real ~/.hermes (read-only). Prints COUNTS ONLY: events
// per kind, token totals and how many models were priced; never titles, text, model names or ids.
// Usage: npm run live-observability -w @dmos/server
import { createHermesAdapter } from '../src/adapters/hermes.ts';
import { createLiveSource } from '../src/hermes/liveSource.ts';
import { HERMES_HOME } from '../src/config.ts';
import { BOT_PROFILES } from '../src/roster.ts';
import { usageWindow } from '../src/usage/periods.ts';
import { summariseUsage } from '../src/usage/pricing.ts';
import { BUILT_IN_PRICES } from '../src/usage/priceTable.ts';
import { USAGE_PERIODS } from '../../shared/observability.ts';

const neverRun = async () => { throw new Error('the live check never runs hermes'); };
const adapter = createHermesAdapter({ source: createLiveSource({ hermesHome: HERMES_HOME, statusUrl: null }), runner: neverRun, hermesBin: '/nonexistent' });
const since = new Date(Date.now() - 86_400_000).toISOString();
const millions = (n: number) => `${(n / 1e6).toFixed(1)}M`;

for (const profile of BOT_PROFILES) {
  const started = performance.now();
  const events = (await adapter.timeline!(profile, { since, limit: 1000 })) ?? [];
  const kinds = events.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.kind]: (acc[e.kind] ?? 0) + 1 }), {});
  const usage = await Promise.all(USAGE_PERIODS.map(async (period) => {
    const u = await adapter.usage!(profile, usageWindow(period, Date.now()));
    const s = summariseUsage(u?.models ?? [], BUILT_IN_PRICES);
    const priced = s.models.filter((m) => m.cost !== null).length;
    return `${period}: in ${millions(s.inputTokens + s.cacheReadTokens + s.cacheWriteTokens)} out ${millions(s.outputTokens)} `
      + `$${s.cost === null ? '-' : s.cost.toFixed(2)} (${priced}/${s.models.length} models priced)`;
  }));
  console.log(`${profile.padEnd(14)} ${events.length} events in 24h ${JSON.stringify(kinds)} | ${usage.join(' | ')} | ${Math.round(performance.now() - started)} ms`);
}
