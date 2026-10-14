import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { MeetingsView } from '../../shared/contract.ts';
import { createApp, type App } from '../src/http/app.ts';
import { createHermesAdapter } from '../src/adapters/hermes.ts';
import { createFixtureSource, loadFixture } from '../src/hermes/fixtureSource.ts';
import { loadMeetingsFixture } from '../src/hermes/meetingsFixture.ts';
import type { Runner } from '../src/chat/runner.ts';
import { STAFF } from '../../shared/office.ts';
import { LEAK_PATTERNS } from './helpers/leakScan.ts';

// The recorded, redacted meetings fixture: Council sessions of 6, 7 and 8 Oct 2026, action items and shared cards.
const meetingsFixture = loadMeetingsFixture();
if (!meetingsFixture) throw new Error('fixtures/hermes-meetings.json is missing');
const T = Date.parse(meetingsFixture.recordedAt) / 1000;
const home = mkdtempSync(path.join(tmpdir(), 'dmos-meetings-http-'));
const runner: Runner = async () => ({ stdout: '', stderr: '', code: 0, timedOut: false });
const STAFF_IDS = new Set(STAFF.map((s) => s.id));

async function start(accessToken: string | null): Promise<{ app: App; base: string }> {
  const source = createFixtureSource({ fixture: loadFixture(), meetings: meetingsFixture, now: () => T });
  const app = createApp({
    adapters: [createHermesAdapter({ source, runner, hermesBin: '/fake/hermes', now: () => T })],
    hermesHome: home, headshotDir: home, pollIntervalMs: 60_000, now: () => T, accessToken,
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  return { app, base: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}` };
}

let open: { app: App; base: string };
let locked: { app: App; base: string };
beforeAll(async () => {
  open = await start(null);
  locked = await start('meetings-access-token-0123456789abcdef');
});
afterAll(async () => {
  await open.app.close();
  await locked.app.close();
  rmSync(home, { recursive: true, force: true });
});

const iso = (s: number) => new Date(s * 1000).toISOString();
const WEEK = `from=${iso(T - 8 * 86_400)}&to=${iso(T + 3600)}`;
const get = async (query: string) => {
  const res = await fetch(`${open.base}/api/meetings${query}`);
  return { status: res.status, text: await res.text() };
};

describe('GET /api/meetings (recorded, redacted kanban records)', () => {
  it('lists Council sessions and shared cards, newest first, with people instead of bots', async () => {
    const { status, text } = await get(`?${WEEK}`);
    expect(status).toBe(200);
    const view = JSON.parse(text) as MeetingsView;
    const council = view.meetings.filter((m) => m.kind === 'council');
    const shared = view.meetings.filter((m) => m.kind === 'shared-task');
    expect(council.length).toBeGreaterThanOrEqual(3);
    expect(shared.length).toBeGreaterThanOrEqual(5);
    const starts = view.meetings.map((m) => m.startedAt);
    expect([...starts].sort().reverse()).toEqual(starts);
    for (const m of view.meetings) {
      expect(m.id).toMatch(/^hermes-(council|task)-t_mtg\d{3}$/);
      for (const id of m.participantIds) expect(STAFF_IDS.has(id), id).toBe(true);
      for (const line of m.lines) if (line.personId) expect(STAFF_IDS.has(line.personId), line.personId).toBe(true);
    }
  });

  it('a full Council session: chaired by Pam, every advisor present, rounds on the agenda, adjourned', async () => {
    const view = JSON.parse((await get(`?${WEEK}`)).text) as MeetingsView;
    const session = view.meetings.find((m) => m.title === 'Council 2026-10-08');
    expect(session).toMatchObject({ kind: 'council', roomId: 'council', status: 'adjourned' });
    expect(session?.participantIds[0]).toBe('pam');
    expect(session?.participantIds).toEqual(expect.arrayContaining(['michael', 'angela', 'sadiq', 'david', 'ryan']));
    expect(session?.agenda.map((a) => a.title)).toEqual(expect.arrayContaining(['round 1 cmo', 'round 3 cfo', 'minutes']));
    expect(session?.agenda.find((a) => a.title === 'round 1 cmo')?.ownerId).toBe('michael');
    const lines = session?.lines ?? [];
    expect(lines[0]).toMatchObject({ kind: 'opened', author: 'Council' });
    expect(lines.at(-1)).toMatchObject({ kind: 'closed', text: 'Adjourned', at: session?.endedAt });
    expect(lines.find((l) => l.text === 'Picked up “round 1 cmo”')?.personId).toBe('michael');
    expect(lines.some((l) => l.kind === 'result')).toBe(true);
    const times = lines.map((l) => l.at);
    expect([...times].sort()).toEqual(times);
  });

  it('sends nothing secret: no chat keys, paths, tokens or raw kanban fields', async () => {
    const { text } = await get(`?${WEEK}`);
    for (const [kind, re] of LEAK_PATTERNS) expect(re.test(text), kind).toBe(false);
    expect(text).not.toMatch(/chat-|"body"|"payload"|"summary"|"assignee"|"profile"/);
  });

  it('defaults to the last two weeks, and a period with no meetings is an empty list', async () => {
    const view = JSON.parse((await get('')).text) as MeetingsView;
    expect(Date.parse(view.from)).toBe((T - 14 * 86_400) * 1000);
    expect(view.meetings.length).toBeGreaterThan(0);
    const empty = JSON.parse((await get(`?from=${iso(T - 60 * 86_400)}&to=${iso(T - 50 * 86_400)}`)).text) as MeetingsView;
    expect(empty.meetings).toEqual([]);
  });

  it.each([
    ['?from=last-week', /from/],
    [`?from=${iso(T)}&to=${iso(T - 60)}`, /after/],
    [`?from=${iso(T - 120 * 86_400)}&to=${iso(T)}`, /92 days/],
  ])('rejects %s with 400', async (query, error) => {
    const { status, text } = await get(query);
    expect(status).toBe(400);
    expect(JSON.parse(text).error).toMatch(error);
  });

  it('is behind sign-in like the rest of the API', async () => {
    const res = await fetch(`${locked.base}/api/meetings?${WEEK}`);
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain('Council');
  });
});
