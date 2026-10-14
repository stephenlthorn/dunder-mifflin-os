// Validation of GET /api/schedule and GET /api/meetings: untrusted until they pass. Bad entries are dropped, not fatal;
// a response that isn't a view at all is null.
import type { CalendarJob, Meeting, MeetingsView, MinutesLine, Occurrence, ScheduleView } from '@shared/contract';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined);
const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): v is T => typeof v === 'string' && (allowed as readonly string[]).includes(v);
const list = <T>(v: unknown, parse: (x: unknown) => T | null, max: number): T[] =>
  (Array.isArray(v) ? v.slice(0, max).flatMap((x) => parse(x) ?? []) : []);
const optional = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
  (value === undefined ? {} : ({ [key]: value } as Record<K, V>));

const REPEATS = ['cron', 'interval', 'once', 'unknown'] as const;
const RUNS = ['ok', 'failed', 'unknown', 'missed', 'upcoming'] as const;

function parseJob(v: unknown): CalendarJob | null {
  if (!isObj(v) || !text(v.key, 80) || !text(v.personId, 64) || !text(v.name, 200) || !oneOf(v.repeats, REPEATS) || typeof v.enabled !== 'boolean') return null;
  return {
    key: text(v.key, 80)!, personId: text(v.personId, 64)!, name: text(v.name, 200)!, schedule: text(v.schedule, 120) ?? '',
    repeats: v.repeats, enabled: v.enabled, timeZone: text(v.timeZone, 64) ?? 'UTC',
    ...optional('lastRunAt', isIso(v.lastRunAt) ? v.lastRunAt : undefined),
    ...optional('lastStatus', text(v.lastStatus, 80)),
    ...optional('nextRunAt', isIso(v.nextRunAt) ? v.nextRunAt : undefined),
  };
}

const parseOccurrence = (keys: ReadonlySet<string>) => (v: unknown): Occurrence | null => {
  if (!isObj(v) || typeof v.jobKey !== 'string' || !keys.has(v.jobKey) || !isIso(v.at) || !oneOf(v.run, RUNS)) return null;
  return { jobKey: v.jobKey, at: v.at, run: v.run, ...optional('nextUp', v.nextUp === true ? true : undefined), ...optional('offSchedule', v.offSchedule === true ? true : undefined) };
};

export function parseScheduleView(v: unknown): ScheduleView | null {
  if (!isObj(v) || !isIso(v.from) || !isIso(v.to) || !isIso(v.generatedAt) || !Array.isArray(v.jobs) || !Array.isArray(v.occurrences)) return null;
  const jobs = list(v.jobs, parseJob, 500);
  const keys = new Set(jobs.map((j) => j.key));
  const next = isObj(v.nextUp) && typeof v.nextUp.jobKey === 'string' && keys.has(v.nextUp.jobKey) && isIso(v.nextUp.at)
    ? { jobKey: v.nextUp.jobKey, at: v.nextUp.at } : undefined;
  return {
    from: v.from, to: v.to, generatedAt: v.generatedAt, timeZone: text(v.timeZone, 64) ?? 'UTC', jobs,
    occurrences: list(v.occurrences, parseOccurrence(keys), 12_000),
    ...optional('nextUp', next), ...optional('truncated', v.truncated === true ? true : undefined),
  };
}

const LINE_KINDS = ['opened', 'started', 'status', 'comment', 'result', 'closed'] as const;
const MEETING_KINDS = ['council', 'shared-task'] as const;
const MEETING_STATUSES = ['scheduled', 'in-session', 'blocked', 'adjourned'] as const;
const TASK_STATUSES = ['todo', 'doing', 'blocked', 'done'] as const;
const ids = (v: unknown) => list(v, (x) => text(x, 64) ?? null, 40);

function parseLine(v: unknown): MinutesLine | null {
  if (!isObj(v) || !isIso(v.at) || !oneOf(v.kind, LINE_KINDS) || !text(v.text, 600)) return null;
  return { at: v.at, kind: v.kind, ...optional('personId', text(v.personId, 64)), ...optional('author', text(v.author, 60)), text: text(v.text, 600)! };
}

function parseAgendaItem(v: unknown): Meeting['agenda'][number] | null {
  if (!isObj(v) || !text(v.taskId, 80) || !oneOf(v.status, TASK_STATUSES)) return null;
  return { taskId: text(v.taskId, 80)!, title: text(v.title, 200) ?? '(untitled)', ...optional('ownerId', text(v.ownerId, 64)), status: v.status };
}

function parseMeeting(v: unknown): Meeting | null {
  if (!isObj(v) || !text(v.id, 100) || !oneOf(v.kind, MEETING_KINDS) || !oneOf(v.status, MEETING_STATUSES) || !isIso(v.startedAt)) return null;
  return {
    id: text(v.id, 100)!, kind: v.kind, title: text(v.title, 200) ?? 'Meeting', roomId: text(v.roomId, 64) ?? 'ops', status: v.status,
    startedAt: v.startedAt, ...optional('endedAt', isIso(v.endedAt) ? v.endedAt : undefined),
    participantIds: ids(v.participantIds), agenda: list(v.agenda, parseAgendaItem, 60), lines: list(v.lines, parseLine, 300),
    ...optional('truncated', v.truncated === true ? true : undefined),
  };
}

export function parseMeetingsView(v: unknown): MeetingsView | null {
  if (!isObj(v) || !isIso(v.from) || !isIso(v.to) || !isIso(v.generatedAt) || !Array.isArray(v.meetings)) return null;
  return { from: v.from, to: v.to, generatedAt: v.generatedAt, meetings: list(v.meetings, parseMeeting, 200) };
}
