// ~/.dunder-mifflin-os/config.yaml (or config.yml / config.json, or the file DMOS_CONFIG names): which agent
// adapters run, and which character each agent becomes. Validated strictly at startup; a mistake stops the server
// with a message naming the file and the field. Secrets never go here (the ingest token is an environment variable).
//
//   adapters: [hermes, webhook, claude-code]       # default: [hermes]; also demo (or { kind: demo, speed: 10 })
//   adapters: [hermes, { kind: claude-code, decide: true, holdSeconds: 120 }]  # answer permission prompts in the office
//   seats:
//     dwight: { adapter: hermes, agent: campaigns }  # merged over the built-in Hermes seating (roster.ts)
//     jim: { adapter: claude-code, agent: paper-site, role: Pair programmer }
//     pam: null                                      # leave a desk without a bot
//   prices:                                          # optional: token prices for the ledger (usage/configPrices.ts)
//     models: { my-model: { input: 0.3, output: 1.2 } }
//   budgets:                                         # optional: USD per bot per day/month ("Corporate", budgets/config.ts)
//     autoPause: false                               # default; true pauses a bot at 100% when its adapter can pause
//     dwight: { monthly: 20 }
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { STAFF } from '../../shared/office.ts';
import { ADAPTER_ID, ADAPTER_KINDS, AGENT_ID, type AdapterKind } from './adapters/types.ts';
import { isRecord } from './hermes/guards.ts';
import type { SeatRule, SeatRules } from './office/seating.ts';
import { parseDemoSettings, type DemoSettings } from './adapters/demo/options.ts';
import { parsePrices } from './usage/configPrices.ts';
import type { ConfigPrices } from './usage/pricing.ts';
import { type BudgetConfig, parseBudgets } from './budgets/config.ts';

export type AdapterSpec = {
  readonly kind: AdapterKind;
  readonly id: string;
  readonly source?: 'live' | 'fixture'; // hermes only
  readonly decide?: boolean; // claude-code only: hold each PermissionRequest until you decide in the office (needs writes on)
  readonly holdSeconds?: number; // claude-code only: how long to hold it before Claude Code asks in the terminal
  readonly demo?: DemoSettings; // demo only: speed, start time, seed
};
export const HOLD_SECONDS = Object.freeze({ min: 5, max: 270 }); // the generated PermissionRequest hook waits 300 s
export type OfficeConfig = {
  readonly adapters: ReadonlyArray<AdapterSpec>; readonly seats: SeatRules; readonly prices?: ConfigPrices; readonly budgets?: BudgetConfig;
};
export type LoadedConfig = OfficeConfig & { readonly file: string | null };

const CONFIG_NAMES = ['config.yaml', 'config.yml', 'config.json'];
const ROLE_MAX = 80;
const DEMO_KEYS = ['speed', 'start', 'seed']; // { kind: demo, speed: 10, start: '10:25', seed: 7 }
const PERSON_IDS: ReadonlySet<string> = new Set(STAFF.map((s) => s.id));

class ConfigError extends Error {}

function onlyKeys(value: Readonly<Record<string, unknown>>, allowed: ReadonlyArray<string>, where: string): void {
  const extra = Object.keys(value).find((k) => !allowed.includes(k));
  if (extra) throw new ConfigError(`${where}: unknown field "${extra}" (expected ${allowed.join(', ')})`);
}

function claudeCodeOptions(value: Readonly<Record<string, unknown>>, kind: AdapterKind, where: string): Pick<AdapterSpec, 'decide' | 'holdSeconds'> {
  if (value.decide === undefined && value.holdSeconds === undefined) return {};
  if (kind !== 'claude-code') throw new ConfigError(`${where}.${value.decide === undefined ? 'holdSeconds' : 'decide'}: only a claude-code adapter holds permission requests`);
  if (value.decide !== undefined && typeof value.decide !== 'boolean') throw new ConfigError(`${where}.decide: true or false`);
  const hold = value.holdSeconds;
  if (hold !== undefined && (typeof hold !== 'number' || !Number.isInteger(hold) || hold < HOLD_SECONDS.min || hold > HOLD_SECONDS.max)) {
    throw new ConfigError(`${where}.holdSeconds: a whole number from ${HOLD_SECONDS.min} to ${HOLD_SECONDS.max}`);
  }
  return { ...(value.decide === undefined ? {} : { decide: value.decide }), ...(hold === undefined ? {} : { holdSeconds: hold }) };
}

function adapterSpec(raw: unknown, i: number): AdapterSpec {
  const where = `adapters[${i}]`;
  const value = typeof raw === 'string' ? { kind: raw } : raw;
  if (!isRecord(value)) throw new ConfigError(`${where}: expected an adapter name or { kind, id }`);
  onlyKeys(value, ['kind', 'id', 'source', 'decide', 'holdSeconds', ...(value.kind === 'demo' ? DEMO_KEYS : [])], where);
  if (typeof value.kind !== 'string' || !(ADAPTER_KINDS as ReadonlyArray<string>).includes(value.kind)) {
    throw new ConfigError(`${where}: kind must be one of ${ADAPTER_KINDS.join(', ')}`);
  }
  const kind = value.kind as AdapterKind;
  const id = value.id ?? kind;
  if (typeof id !== 'string' || !ADAPTER_ID.test(id)) throw new ConfigError(`${where}.id: 1-12 lower-case letters, digits or dashes, starting with a letter`);
  const options = claudeCodeOptions(value, kind, where);
  if (kind === 'demo' && value.source === undefined) return demoSpec(id, value, where);
  if (value.source === undefined) return { kind, id, ...options };
  if (kind !== 'hermes' || (value.source !== 'live' && value.source !== 'fixture')) {
    throw new ConfigError(`${where}.source: only a hermes adapter has a source (live or fixture)`);
  }
  return { kind, id, source: value.source };
}

function demoSpec(id: string, value: Readonly<Record<string, unknown>>, where: string): AdapterSpec {
  const settings = parseDemoSettings(value);
  if (!settings.ok) throw new ConfigError(`${where}.${settings.field}: ${settings.error}`);
  return Object.keys(settings.value).length ? { kind: 'demo', id, demo: settings.value } : { kind: 'demo', id };
}

function adapterSpecs(raw: unknown): AdapterSpec[] {
  if (raw === undefined) return [{ kind: 'hermes', id: 'hermes' }];
  if (!Array.isArray(raw)) throw new ConfigError('adapters: expected a list, e.g. [hermes, webhook]');
  const specs = raw.map(adapterSpec);
  const dup = specs.find((s, i) => specs.findIndex((o) => o.id === s.id) !== i);
  if (dup) throw new ConfigError(`adapters: "${dup.id}" is listed twice (give the second one its own id)`);
  if (specs.filter((s) => s.kind === 'hermes').length > 1) throw new ConfigError('adapters: run at most one hermes adapter');
  return specs;
}

function seatRule(personId: string, raw: unknown, adapterIds: ReadonlySet<string>): SeatRule | null {
  const where = `seats.${personId}`;
  if (!PERSON_IDS.has(personId)) throw new ConfigError(`${where}: "${personId}" is not a character (see shared/office/staff.ts)`);
  if (raw === null) return null;
  if (!isRecord(raw)) throw new ConfigError(`${where}: expected { adapter, agent } or null`);
  onlyKeys(raw, ['adapter', 'agent', 'role'], where);
  if (typeof raw.adapter !== 'string' || !adapterIds.has(raw.adapter)) {
    throw new ConfigError(`${where}.adapter: must be one of the adapters listed (${[...adapterIds].join(', ')}); got ${String(raw.adapter)}`);
  }
  if (typeof raw.agent !== 'string' || !AGENT_ID.test(raw.agent)) throw new ConfigError(`${where}.agent: lower-case letters, digits and dashes`);
  if (raw.role !== undefined && (typeof raw.role !== 'string' || !raw.role.trim() || raw.role.length > ROLE_MAX || /[\r\n]/.test(raw.role))) {
    throw new ConfigError(`${where}.role: one line of at most ${ROLE_MAX} characters`);
  }
  const base = { adapter: raw.adapter, agent: raw.agent };
  return typeof raw.role === 'string' ? { ...base, role: raw.role.trim() } : base;
}

export function parseOfficeConfig(raw: unknown, file: string): OfficeConfig {
  try {
    if (raw === null || raw === undefined) return { adapters: adapterSpecs(undefined), seats: {} };
    if (!isRecord(raw)) throw new ConfigError('expected a mapping with adapters and seats');
    onlyKeys(raw, ['adapters', 'seats', 'prices', 'budgets'], 'config');
    const adapters = adapterSpecs(raw.adapters);
    if (raw.seats !== undefined && raw.seats !== null && !isRecord(raw.seats)) throw new ConfigError('seats: expected a mapping of character -> { adapter, agent }');
    const ids = new Set(adapters.map((a) => a.id));
    const seats = Object.fromEntries(Object.entries(isRecord(raw.seats) ? raw.seats : {}).map(([p, r]) => [p, seatRule(p, r, ids)]));
    const prices = raw.prices === undefined || raw.prices === null ? null : parsePrices(raw.prices);
    if (prices && !prices.ok) throw new ConfigError(prices.error);
    const budgets = raw.budgets === undefined || raw.budgets === null ? null : parseBudgets(raw.budgets);
    if (budgets && !budgets.ok) throw new ConfigError(budgets.error);
    return { adapters, seats, ...(prices?.ok ? { prices: prices.value } : {}), ...(budgets?.ok ? { budgets: budgets.value } : {}) };
  } catch (error) {
    if (error instanceof ConfigError) throw new Error(`${file}: ${error.message}`);
    throw error;
  }
}

export function loadOfficeConfig(opts: { env: Readonly<Record<string, string | undefined>>; home: string }): LoadedConfig {
  const explicit = opts.env.DMOS_CONFIG?.trim();
  if (explicit && !existsSync(explicit)) throw new Error(`DMOS_CONFIG: no file at ${explicit}`);
  const dir = path.join(opts.home, '.dunder-mifflin-os');
  const file = explicit || CONFIG_NAMES.map((n) => path.join(dir, n)).find((f) => existsSync(f)) || null;
  if (!file) return { file: null, ...parseOfficeConfig(undefined, 'defaults') };
  let raw: unknown;
  try {
    raw = YAML.parse(readFileSync(file, 'utf8'), { logLevel: 'error' });
  } catch (error) {
    throw new Error(`${file}: not valid YAML/JSON (${error instanceof Error ? error.message.split('\n')[0] : 'parse error'})`);
  }
  return { file, ...parseOfficeConfig(raw, file) };
}
