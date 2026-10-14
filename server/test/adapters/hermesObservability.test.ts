// The hermes adapter's timeline and usage over the recorded, redacted fixtures (fixtures/hermes-activity.json).
import { describe, expect, it } from 'vitest';
import { createHermesAdapter } from '../../src/adapters/hermes.ts';
import { createFixtureSource, loadFixture } from '../../src/hermes/fixtureSource.ts';
import { loadActivityFixture } from '../../src/hermes/fixtureActivity.ts';
import type { Runner } from '../../src/chat/runner.ts';
import { CRON_NAMES, LOG_MESSAGES, SAID, TASK_TITLES } from '../../scripts/redactActivity.ts';
import { LEAK_PATTERNS } from '../helpers/leakScan.ts';
import { TIMELINE_KINDS } from '../../../shared/observability.ts';

const fixture = loadFixture();
const activity = loadActivityFixture()!;
const T = Date.parse(fixture.state.recordedAt) / 1000;
const runner: Runner = async () => ({ stdout: '', stderr: '', code: 0, timedOut: false });
const adapter = createHermesAdapter({ source: createFixtureSource({ fixture, activity }), runner, hermesBin: 'h', now: () => T });
const iso = (t: number) => new Date(t * 1000).toISOString();
const leaks = (text: string) => LEAK_PATTERNS.filter(([, re]) => re.test(text)).map(([k]) => k);

describe('the recorded activity fixture', () => {
  it('is redacted: synthetic text only, no secrets, lined up with the state fixture', () => {
    expect(Math.abs(Date.parse(activity.recordedAt) - Date.parse(fixture.state.recordedAt))).toBeLessThan(1000);
    const textOnly = LEAK_PATTERNS.filter(([kind]) => !kind.startsWith('long digit run')); // epoch seconds are 10 digits
    const json = JSON.stringify(activity);
    expect(textOnly.filter(([, re]) => re.test(json)).map(([k]) => k)).toEqual([]);
    const said = new Set([...SAID.user, ...SAID.assistant]);
    for (const { activity: a } of Object.values(activity.profiles)) {
      for (const m of a.messages) expect(said.has(m.text), m.text).toBe(true);
      for (const t of [...a.tasks, ...a.runs]) expect(TASK_TITLES).toContain(t.title);
      for (const c of a.cron) expect(CRON_NAMES).toContain(c.jobName);
      for (const e of a.errors) expect(LOG_MESSAGES).toContain(e.message);
      for (const s of a.sessions) expect(['Direct chat', 'Terminal session', 'API session', null]).toContain(s.title);
    }
  });
});

describe('hermes adapter timeline', () => {
  it('turns the recording into well-formed, scrubbed events, newest first', async () => {
    const events = (await adapter.timeline!('campaigns', { since: iso(T - 86_400), limit: 500 }))!;
    expect(events.length).toBeGreaterThan(10);
    for (const e of events) expect(TIMELINE_KINDS).toContain(e.kind);
    expect(events.some((e) => e.kind === 'cron.ok')).toBe(true);
    expect(events.some((e) => e.kind === 'tool.call')).toBe(true);
    const times = events.map((e) => Date.parse(e.at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    expect(leaks(JSON.stringify(events))).toEqual([]);
  });

  it('honours the limit and answers null for agents it does not have', async () => {
    expect(await adapter.timeline!('campaigns', { since: iso(T - 86_400), limit: 3 })).toHaveLength(3);
    expect(await adapter.timeline!('nobody', { since: iso(T - 86_400), limit: 3 })).toBeNull();
    expect(await adapter.timeline!('campaigns', { since: 'not a time', limit: 3 })).toBeNull();
  });

  it('is null when the source keeps no activity', async () => {
    const bare = createHermesAdapter({ source: createFixtureSource({ fixture, activity: null }), runner, hermesBin: 'h', now: () => T });
    expect(await bare.timeline!('campaigns', { since: iso(T - 86_400), limit: 10 })).toBeNull();
    expect(await bare.usage!('campaigns', { from: iso(T - 86_400), to: iso(T) })).toBeNull();
  });
});

describe('hermes adapter usage', () => {
  it('sums tokens per model in the window', async () => {
    const month = (await adapter.usage!('campaigns', { from: iso(T - 30 * 86_400), to: iso(T + 1) }))!;
    const day = (await adapter.usage!('campaigns', { from: iso(T - 3600), to: iso(T + 1) }))!;
    const total = (u: typeof month) => u.models.reduce((n, m) => n + m.inputTokens + m.outputTokens, 0);
    expect(month.models.length).toBeGreaterThan(0);
    expect(total(month)).toBeGreaterThan(total(day));
    expect(new Set(month.models.map((m) => m.model)).size).toBe(month.models.length);
    expect(await adapter.usage!('nobody', { from: iso(T - 3600), to: iso(T) })).toBeNull();
  });
});
