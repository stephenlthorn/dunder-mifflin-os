import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ScheduleView } from '../../shared/contract.ts';
import { createApp, type App } from '../src/http/app.ts';
import { createHermesAdapter } from '../src/adapters/hermes.ts';
import { createFixtureSource, loadFixture } from '../src/hermes/fixtureSource.ts';
import type { Runner } from '../src/chat/runner.ts';
import { LEAK_PATTERNS } from './helpers/leakScan.ts';

const fixture = loadFixture();
const T = Date.parse(fixture.state.recordedAt) / 1000; // Tuesday 2026-10-13, 12:11 in New York
const NY = 'America/New_York';
const home = mkdtempSync(path.join(tmpdir(), 'dmos-schedule-'));
const runner: Runner = async () => ({ stdout: '', stderr: '', code: 0, timedOut: false });
const TOKEN = 'schedule-access-token-0123456789abcdef';

async function start(accessToken: string | null): Promise<{ app: App; base: string }> {
  const app = createApp({
    adapters: [createHermesAdapter({ source: createFixtureSource({ fixture }), runner, hermesBin: '/fake/hermes', now: () => T })],
    hermesHome: home, headshotDir: home, pollIntervalMs: 60_000, now: () => T, timeZone: NY, accessToken,
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  return { app, base: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}` };
}

let open: { app: App; base: string };
let locked: { app: App; base: string };
beforeAll(async () => {
  open = await start(null);
  locked = await start(TOKEN);
});
afterAll(async () => {
  await open.app.close();
  await locked.app.close();
  rmSync(home, { recursive: true, force: true });
});

const WEEK = 'from=2026-10-12T04:00:00.000Z&to=2026-10-19T04:00:00.000Z';
const get = async (query: string) => {
  const res = await fetch(`${open.base}/api/schedule${query}`);
  return { status: res.status, text: await res.text() };
};

describe('GET /api/schedule', () => {
  it('lists every scheduled job by person and expands it into runs in New York time', async () => {
    const { status, text } = await get(`?${WEEK}`);
    expect(status).toBe(200);
    const view = JSON.parse(text) as ScheduleView;
    expect(view.from).toBe('2026-10-12T04:00:00.000Z');
    expect(view.timeZone).toBe(NY);
    const people = new Set(view.jobs.map((j) => j.personId));
    expect(people.has('pam')).toBe(true); // chief
    expect(people.has('dwight')).toBe(true); // campaigns
    for (const id of people) expect(id).toMatch(/^[a-z]+$/); // person ids, never profile keys like 'ai-strategist'
    const morning = view.jobs.find((j) => j.personId === 'pam' && j.schedule === '30 8 * * 1-5');
    expect(morning).toMatchObject({ name: 'Morning report', repeats: 'cron', enabled: true });
    const runs = view.occurrences.filter((o) => o.jobKey === morning?.key).map((o) => [o.at, o.run]);
    expect(runs).toEqual([
      ['2026-10-12T12:30:00.000Z', 'unknown'],
      ['2026-10-13T12:30:00.000Z', 'ok'], // today's recorded run
      ['2026-10-14T12:30:00.000Z', 'upcoming'],
      ['2026-10-15T12:30:00.000Z', 'upcoming'],
      ['2026-10-16T12:30:00.000Z', 'upcoming'],
    ]);
    const times = view.occurrences.map((o) => o.at);
    expect([...times].sort()).toEqual(times);
    expect(view.nextUp && Date.parse(view.nextUp.at)).toBeGreaterThan(T * 1000);
    expect(view.occurrences.filter((o) => o.nextUp)).toHaveLength(1);
  });

  it('sends display data only: no job ids, prompts, paths or secrets', async () => {
    const { text } = await get(`?${WEEK}`);
    expect(text).not.toMatch(/"id"|prompt|"j\d+"/);
    for (const [kind, re] of LEAK_PATTERNS) expect(re.test(text), kind).toBe(false);
  });

  it('defaults to the next week (from a day ago) without a period', async () => {
    const view = JSON.parse((await get('')).text) as ScheduleView;
    expect(Date.parse(view.from)).toBe((T - 86_400) * 1000);
    expect(Date.parse(view.to)).toBe((T + 7 * 86_400) * 1000);
  });

  it.each([
    ['?from=yesterday&to=2026-10-19T04:00:00Z', /from/],
    ['?from=2026-10-12T04:00:00Z&to=soon', /to/],
    ['?from=2026-10-19T04:00:00Z&to=2026-10-12T04:00:00Z', /after/],
    ['?from=2026-10-01T00:00:00Z&to=2026-12-01T00:00:00Z', /42 days/],
    ['?from=1900-01-01T00:00:00Z&to=1900-01-02T00:00:00Z', /from/],
    [`?from=${'2'.repeat(500)}`, /from/],
  ])('rejects %s with 400', async (query, error) => {
    const { status, text } = await get(query);
    expect(status).toBe(400);
    expect(JSON.parse(text).error).toMatch(error);
  });

  it('is behind sign-in like the rest of the API', async () => {
    const res = await fetch(`${locked.base}/api/schedule?${WEEK}`);
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain('Morning report');
  });
});
