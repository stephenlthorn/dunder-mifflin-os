// Demo adapter settings (speed, start time, seed) from the config file or the environment, validated at the edge.
import { parseClockTime, parseSeed, parseSpeed, type DemoSpeed } from '../../../../shared/demo/time.ts';

export type DemoSettings = { readonly speed?: DemoSpeed; readonly start?: number; readonly seed?: number };
export type RawDemoSettings = { readonly speed?: unknown; readonly start?: unknown; readonly seed?: unknown };
export type SettingsResult = { ok: true; value: DemoSettings } | { ok: false; field: keyof RawDemoSettings; error: string };

const RULES = {
  speed: { parse: parseSpeed, error: '1, 10 or 60' },
  start: { parse: parseClockTime, error: 'an office time from 08:30 to 17:29, like "10:25"' },
  seed: { parse: parseSeed, error: 'a whole number from 0 to 2147483647' },
} as const;

/** Absent fields stay absent (the adapter's defaults apply). */
export function parseDemoSettings(raw: RawDemoSettings): SettingsResult {
  const fields = Object.keys(RULES) as Array<keyof RawDemoSettings>;
  const bad = fields.find((f) => raw[f] !== undefined && RULES[f].parse(raw[f]) === null);
  if (bad) return { ok: false, field: bad, error: RULES[bad].error };
  return { ok: true, value: Object.fromEntries(fields.flatMap((f) => (raw[f] === undefined ? [] : [[f, RULES[f].parse(raw[f])]]))) };
}

const ENV_NAMES = { speed: 'DMOS_DEMO_SPEED', start: 'DMOS_DEMO_START', seed: 'DMOS_DEMO_SEED' } as const;

/** DMOS_DEMO_SPEED, DMOS_DEMO_START and DMOS_DEMO_SEED; throws naming the variable when one is wrong. */
export function demoSettingsFromEnv(env: Readonly<Record<string, string | undefined>>): DemoSettings {
  const pick = (name: string) => (env[name]?.trim() ? env[name] : undefined);
  const result = parseDemoSettings({ speed: pick(ENV_NAMES.speed), start: pick(ENV_NAMES.start), seed: pick(ENV_NAMES.seed) });
  if (!result.ok) throw new Error(`${ENV_NAMES[result.field]} must be ${result.error}`);
  return result.value;
}
