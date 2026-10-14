// The `fixture` adapter: recorded, redacted Hermes data (fixtures/hermes-fixture.json) for tests and demo mode.
// With `shift`, every timestamp moves forward so the recording looks "live" at the current time.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EpochSeconds, HermesSource, HermesState, MessageQuery, RawMessage } from './types.ts';
import { isRecord } from './guards.ts';
import { fixtureMeetingRecords, loadMeetingsFixture, type MeetingsFixture } from './meetingsFixture.ts';
import { createFixtureActivity, loadActivityFixture, type ActivityFixture } from './fixtureActivity.ts';

export type FixtureMessages = { readonly profile: string; readonly target: string; readonly messages: ReadonlyArray<RawMessage> };
export type Fixture = { readonly meta: Readonly<Record<string, unknown>>; readonly state: HermesState; readonly messages: ReadonlyArray<FixtureMessages> };

export const DEFAULT_FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'hermes-fixture.json');

export function parseFixture(json: unknown): Fixture {
  if (!isRecord(json) || !isRecord(json.state) || !Array.isArray(json.messages) || !isRecord(json.meta)) {
    throw new Error('fixture: expected { meta, state, messages }');
  }
  const state = json.state;
  if (typeof state.recordedAt !== 'string' || !isRecord(state.kanban) || !Array.isArray(state.telegram)) {
    throw new Error('fixture: state is missing recordedAt/kanban/telegram');
  }
  return json as unknown as Fixture;
}

export function loadFixture(file: string = DEFAULT_FIXTURE): Fixture {
  return parseFixture(JSON.parse(readFileSync(file, 'utf8')));
}

const shiftNum = (t: number | null, d: number): number | null => (t === null ? null : t + d);
const shiftIso = (t: string | null, d: number): string | null => {
  const ms = t ? Date.parse(t) : Number.NaN;
  return Number.isFinite(ms) ? new Date(ms + d * 1000).toISOString() : t;
};

export function shiftState(s: HermesState, d: number): HermesState {
  if (d === 0) return s;
  return {
    ...s,
    recordedAt: shiftIso(s.recordedAt, d) ?? s.recordedAt,
    gateway: s.gateway && { ...s.gateway, platforms: s.gateway.platforms.map((p) => ({ ...p, updatedAt: shiftIso(p.updatedAt, d) })) },
    kanban: {
      ...s.kanban,
      tasks: s.kanban.tasks.map((t) => ({
        ...t, createdAt: t.createdAt + d, startedAt: shiftNum(t.startedAt, d), completedAt: shiftNum(t.completedAt, d), lastHeartbeatAt: shiftNum(t.lastHeartbeatAt, d),
      })),
      runs: s.kanban.runs.map((r) => ({ ...r, startedAt: r.startedAt + d, endedAt: shiftNum(r.endedAt, d), lastHeartbeatAt: shiftNum(r.lastHeartbeatAt, d) })),
      ...(s.kanban.waiting ? { waiting: s.kanban.waiting.map((w) => ({ ...w, since: w.since + d })) } : {}),
    },
    sessions: s.sessions.map((x) => ({ ...x, lastActivityAt: shiftNum(x.lastActivityAt, d) })),
    cron: s.cron.map((j) => ({ ...j, lastRunAt: shiftIso(j.lastRunAt, d), nextRunAt: shiftIso(j.nextRunAt, d) })),
  };
}

function targetsFor(q: MessageQuery): ReadonlyArray<string> {
  const telegram = q.target.kind === 'dm' ? ['dm'] : q.target.kind === 'group' ? [`group:${q.target.chatKey}`] : [];
  return q.osSessionTitle ? [...telegram, `os:${q.osSessionTitle}`] : telegram;
}

export type FixtureSourceOptions = {
  fixture?: Fixture; meetings?: MeetingsFixture | null; activity?: ActivityFixture | null; now?: () => EpochSeconds; shift?: boolean;
};

export function createFixtureSource(opts: FixtureSourceOptions = {}): HermesSource {
  const fixture = opts.fixture ?? loadFixture();
  const meetings = opts.meetings === undefined ? loadMeetingsFixture() : opts.meetings;
  const activity = createFixtureActivity({ fixture: opts.activity === undefined ? loadActivityFixture() : opts.activity, shift: opts.shift, now: opts.now });
  const recordedAt = Date.parse(fixture.state.recordedAt) / 1000;
  const delta = (): number => (opts.shift ? Math.round((opts.now ?? (() => Date.now() / 1000))() - recordedAt) : 0);

  return {
    kind: 'fixture',
    ...activity,
    readState: async () => shiftState(fixture.state, delta()),
    readMeetingRecords: async () => fixtureMeetingRecords(meetings, (opts.now ?? (() => Date.now() / 1000))(), opts.shift === true),
    readMessages: async (q) => {
      const targets = targetsFor(q);
      const d = delta();
      const entries = fixture.messages.filter((m) => m.profile === q.profile && targets.includes(m.target));
      if (!entries.length) return { ok: false, reason: 'not-in-fixture' };
      const messages = entries.flatMap((e) => e.messages.map((m) => (e.target.startsWith('os:') ? { ...m, origin: 'os' as const } : m)))
        .map((m) => ({ ...m, at: m.at + d }))
        .sort((a, b) => a.at - b.at)
        .slice(-q.limit);
      return { ok: true, messages };
    },
  };
}
