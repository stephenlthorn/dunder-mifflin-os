// GET /api/schedule and GET /api/meetings, validated, plus the demo-mode stand-ins built in the browser from the
// shared demo data with the same code the server uses.
import type { MeetingsView, ScheduleView } from '@shared/contract';
import { buildScheduleView } from '@shared/schedule/view';
import { DEMO_ZONE, demoScheduleJobs } from '@shared/fixtures/demo-schedule';
import { demoMeetings } from '@shared/fixtures/demo-meetings';
import { parseMeetingsView, parseScheduleView } from './calendarGuards';

export type Span = { from: number; to: number }; // epoch ms, [from, to)

const query = (s: Span) => `from=${encodeURIComponent(new Date(s.from).toISOString())}&to=${encodeURIComponent(new Date(s.to).toISOString())}`;

async function getJson<T>(path: string, parse: (v: unknown) => T | null, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { accept: 'application/json' } });
  if (res.status === 401) throw new Error('Sign in again to see this.');
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // fall through: not JSON
  }
  if (!res.ok) {
    const error = typeof body === 'object' && body && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : `HTTP ${res.status}`;
    throw new Error(error);
  }
  const parsed = parse(body);
  if (!parsed) throw new Error('The server sent something unexpected.');
  return parsed;
}

export const fetchSchedule = (span: Span, signal?: AbortSignal) => getJson(`/api/schedule?${query(span)}`, parseScheduleView, signal);
export const fetchMeetings = (span: Span, signal?: AbortSignal) => getJson(`/api/meetings?${query(span)}`, parseMeetingsView, signal);

export function demoSchedule(span: Span, now: number): ScheduleView {
  return buildScheduleView({ jobs: demoScheduleJobs(now), span, now, defaultTimeZone: DEMO_ZONE });
}

export function demoMeetingsIn(span: Span, now: number): MeetingsView {
  const all = demoMeetings(now);
  const meetings = all.meetings.filter((m) => Date.parse(m.startedAt) < span.to && Date.parse(m.endedAt ?? new Date(now).toISOString()) >= span.from);
  return { ...all, from: new Date(span.from).toISOString(), to: new Date(span.to).toISOString(), meetings };
}
