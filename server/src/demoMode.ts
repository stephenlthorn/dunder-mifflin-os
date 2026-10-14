// DMOS_SOURCE=demo (`npx dunder-mifflin-os --demo`, `npm run demo`, the Docker demo): run the scripted demo day alone.
// The config file is ignored (it could name Hermes), writes are on because they only reach the demo's in-memory bots
// (DMOS_ALLOW_WRITES=0 still turns them off), Corporate watches the demo's own budgets (adapters/demo/usage.ts), and
// main.ts serves no photos or headshots and audits in memory. Pure: env in, settings out.
import type { AdapterSpec, LoadedConfig } from './officeConfig.ts';
import { demoSettingsFromEnv } from './adapters/demo/options.ts';
import { demoSeatRules } from './adapters/demo/seats.ts';
import { DEMO_BUDGETS } from './adapters/demo/usage.ts';
import type { SeatRules } from './office/seating.ts';
import { DEFAULT_SEATS } from './roster.ts';
import { isOff } from './envFlags.ts';

type Env = Readonly<Record<string, string | undefined>>;

export const isDemoSource = (env: Env): boolean => env.DMOS_SOURCE?.trim() === 'demo';

/** The demo's config and write switch, or null when DMOS_SOURCE isn't demo. Throws naming a bad DMOS_DEMO_* value. */
export function demoStartup(env: Env): { config: LoadedConfig; allowWrites: boolean } | null {
  if (!isDemoSource(env)) return null;
  const settings = demoSettingsFromEnv(env);
  const spec: AdapterSpec = Object.keys(settings).length ? { kind: 'demo', id: 'demo', demo: settings } : { kind: 'demo', id: 'demo' };
  return { config: { file: null, adapters: [spec], seats: {}, budgets: DEMO_BUDGETS }, allowWrites: !isOff(env.DMOS_ALLOW_WRITES) };
}

/** The built-in seating, with every demo adapter's bots at their characters on top. */
export function seatDefaults(adapters: ReadonlyArray<AdapterSpec>): SeatRules {
  return adapters.filter((a) => a.kind === 'demo').reduce<SeatRules>((rules, a) => ({ ...rules, ...demoSeatRules(a.id) }), DEFAULT_SEATS);
}

/** Only demo adapters run: nothing on this server is real, so photos, headshots and Hermes stay out of reach. */
export const isDemoOnly = (adapters: ReadonlyArray<AdapterSpec>): boolean => adapters.length > 0 && adapters.every((a) => a.kind === 'demo');
