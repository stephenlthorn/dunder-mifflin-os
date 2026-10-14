// Timeline and usage for the `fixture` Hermes source: fixtures/hermes-activity.json, recorded from the live readers
// and redacted (scripts/record-activity.ts). With `shift`, every time moves forward so the recording looks current.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModelTokens } from '../adapters/types.ts';
import type { EpochSeconds } from './types.ts';
import type { HermesActivity, HermesActivitySource, UsageRecord } from './activityTypes.ts';
import { isRecord } from './guards.ts';

export type ActivityFixture = {
  readonly meta: Readonly<Record<string, unknown>>;
  readonly recordedAt: string;
  readonly profiles: Readonly<Record<string, { readonly activity: HermesActivity; readonly usage: ReadonlyArray<UsageRecord> }>>;
};

export const DEFAULT_ACTIVITY_FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'hermes-activity.json');

export function loadActivityFixture(file: string = DEFAULT_ACTIVITY_FIXTURE): ActivityFixture | null {
  if (!existsSync(file)) return null;
  const json: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!isRecord(json) || typeof json.recordedAt !== 'string' || !isRecord(json.profiles)) throw new Error('activity fixture: expected { recordedAt, profiles }');
  return json as unknown as ActivityFixture;
}

export function shiftActivity(a: HermesActivity, d: number): HermesActivity {
  if (d === 0) return a;
  const opt = (t: number | null) => (t === null ? null : t + d);
  return {
    sessions: a.sessions.map((s) => ({ ...s, startedAt: s.startedAt + d, endedAt: opt(s.endedAt) })),
    messages: a.messages.map((m) => ({ ...m, at: m.at + d })),
    tools: a.tools.map((t) => ({ ...t, lastAt: t.lastAt + d })),
    tasks: a.tasks.map((t) => ({ ...t, createdAt: t.createdAt + d })),
    runs: a.runs.map((r) => ({ ...r, startedAt: r.startedAt + d, endedAt: opt(r.endedAt) })),
    cron: a.cron.map((c) => ({ ...c, at: c.at + d })),
    errors: a.errors.map((e) => ({ ...e, at: e.at + d })),
  };
}

function since<T>(items: ReadonlyArray<T>, time: (x: T) => number | null, from: number, limit: number): T[] {
  return items.filter((x) => (time(x) ?? -Infinity) >= from).slice(0, limit);
}

export function sumByModel(rows: ReadonlyArray<ModelTokens>): ModelTokens[] {
  const byModel = rows.reduce((acc, r) => {
    const p = acc.get(r.model);
    if (!p) return new Map([...acc, [r.model, r]]);
    const amount = (p.recordedCost?.amount ?? 0) + (r.recordedCost?.amount ?? 0);
    const kind = p.recordedCost?.kind ?? r.recordedCost?.kind;
    const merged: ModelTokens = {
      model: r.model, inputTokens: p.inputTokens + r.inputTokens, outputTokens: p.outputTokens + r.outputTokens,
      cacheReadTokens: p.cacheReadTokens + r.cacheReadTokens, cacheWriteTokens: p.cacheWriteTokens + r.cacheWriteTokens,
      reasoningTokens: p.reasoningTokens + r.reasoningTokens, calls: (p.calls ?? 0) + (r.calls ?? 0),
      ...(kind ? { recordedCost: { amount, kind } } : {}),
    };
    return new Map([...acc, [r.model, merged]]);
  }, new Map<string, ModelTokens>());
  return [...byModel.values()];
}

export function createFixtureActivity(opts: { fixture: ActivityFixture | null; shift?: boolean; now?: () => EpochSeconds }): HermesActivitySource {
  const fixture = opts.fixture;
  const recordedAt = fixture ? Date.parse(fixture.recordedAt) / 1000 : 0;
  const delta = (): number => (opts.shift ? Math.round((opts.now ?? (() => Date.now() / 1000))() - recordedAt) : 0);

  return {
    readActivity: async (profile, from, limit) => {
      const entry = fixture && Object.hasOwn(fixture.profiles, profile) ? fixture.profiles[profile] : undefined;
      if (!entry) return null;
      const a = shiftActivity(entry.activity, delta());
      return {
        sessions: since(a.sessions, (s) => s.endedAt ?? s.startedAt, from, limit), messages: since(a.messages, (m) => m.at, from, limit),
        tools: since(a.tools, (t) => t.lastAt, from, limit), tasks: since(a.tasks, (t) => t.createdAt, from, limit),
        runs: since(a.runs, (r) => r.endedAt ?? r.startedAt, from, limit), cron: since(a.cron, (c) => c.at, from, limit),
        errors: since(a.errors, (e) => e.at, from, limit),
      };
    },
    readUsage: async (profile, from, to) => {
      const entry = fixture && Object.hasOwn(fixture.profiles, profile) ? fixture.profiles[profile] : undefined;
      if (!entry) return null;
      const d = delta();
      return sumByModel(entry.usage.filter((u) => u.at + d >= from && u.at + d < to).map(({ at: _at, ...tokens }) => tokens));
    },
  };
}
