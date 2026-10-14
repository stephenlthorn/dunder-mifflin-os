// Recorded, redacted kanban records for Conference Room minutes (fixtures/hermes-meetings.json, written by
// scripts/record-meetings.ts). Kept apart from hermes-fixture.json so either can be re-recorded on its own.
// With a time shift, every timestamp moves forward so the recording looks recent.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EpochSeconds } from './types.ts';
import type { MeetingRecords } from './meetingTypes.ts';
import { isRecord } from './guards.ts';

export type MeetingsFixture = { readonly meta: Readonly<Record<string, unknown>>; readonly recordedAt: string; readonly records: MeetingRecords };

export const DEFAULT_MEETINGS_FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'hermes-meetings.json');
const LISTS = ['tasks', 'runs', 'subs', 'links', 'comments', 'events'] as const;

export function parseMeetingsFixture(json: unknown): MeetingsFixture {
  const records = isRecord(json) ? json.records : null;
  if (!isRecord(json) || typeof json.recordedAt !== 'string' || !isRecord(records) || !LISTS.every((k) => Array.isArray(records[k]))) {
    throw new Error('meetings fixture: expected { meta, recordedAt, records: { tasks, runs, subs, links, comments, events } }');
  }
  return json as unknown as MeetingsFixture;
}

/** The default recording, or null when the file isn't there (a trimmed install). */
export function loadMeetingsFixture(file: string = DEFAULT_MEETINGS_FIXTURE): MeetingsFixture | null {
  return existsSync(file) ? parseMeetingsFixture(JSON.parse(readFileSync(file, 'utf8'))) : null;
}

const plus = (t: EpochSeconds | null, d: number): EpochSeconds | null => (t === null ? null : t + d);

export function shiftMeetings(r: MeetingRecords, d: number): MeetingRecords {
  if (d === 0) return r;
  return {
    ...r,
    tasks: r.tasks.map((t) => ({ ...t, createdAt: t.createdAt + d, startedAt: plus(t.startedAt, d), completedAt: plus(t.completedAt, d), lastHeartbeatAt: plus(t.lastHeartbeatAt, d) })),
    runs: r.runs.map((x) => ({ ...x, startedAt: x.startedAt + d, endedAt: plus(x.endedAt, d), lastHeartbeatAt: plus(x.lastHeartbeatAt, d) })),
    comments: r.comments.map((c) => ({ ...c, createdAt: c.createdAt + d })),
    events: r.events.map((e) => ({ ...e, createdAt: e.createdAt + d })),
  };
}

/** The fixture's records as of `now` (shifted when asked), or null without a recording. */
export function fixtureMeetingRecords(fixture: MeetingsFixture | null, now: EpochSeconds, shift: boolean): MeetingRecords | null {
  if (!fixture) return null;
  const delta = shift ? Math.round(now - Date.parse(fixture.recordedAt) / 1000) : 0;
  return shiftMeetings(fixture.records, delta);
}
