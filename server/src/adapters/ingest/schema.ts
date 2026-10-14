// The webhook event schema (docs/adapters/webhook.schema.json documents the same rules; a test keeps them in step).
// One event per request. Unknown fields are refused so typos surface instead of being silently ignored.
import type { ApprovalRisk, BotStatus, Task } from '../../../../shared/contract.ts';
import { isRecord } from '../../hermes/guards.ts';

export const INGEST_TYPES = ['status', 'activity', 'task', 'message', 'approval', 'approval-withdrawn', 'controls'] as const;
/** What a webhook agent can let the office do to it (`controls` event): pause (and resume) and stop. */
export const CONTROL_VERBS = ['pause', 'stop'] as const;
export type ControlVerb = (typeof CONTROL_VERBS)[number];
export const APPROVAL_KINDS = ['permission', 'question', 'task'] as const;
export const APPROVAL_RISKS: ReadonlyArray<ApprovalRisk> = ['low', 'medium', 'high'];
export const INGEST_STATUSES: ReadonlyArray<BotStatus> = ['working', 'idle', 'offline', 'error', 'meeting', 'needs-input'];
export const TASK_STATUSES: ReadonlyArray<Task['status']> = ['todo', 'doing', 'blocked', 'done'];
export const LIMITS = Object.freeze({ name: 60, role: 80, activity: 200, text: 4000, title: 200, detail: 600, callback: 500 });

type Common = { readonly name?: string; readonly role?: string; readonly at: number /* epoch ms */ };
export type IngestEvent =
  | Common & { readonly type: 'status'; readonly status: BotStatus; readonly activity?: string; readonly room?: string }
  | Common & { readonly type: 'activity'; readonly text: string }
  | Common & { readonly type: 'task'; readonly id: string; readonly title: string; readonly status: Task['status']; readonly room?: string; readonly shared?: boolean }
  | Common & { readonly type: 'message'; readonly text: string }
  | Common & {
    readonly type: 'approval'; readonly id: string; readonly title: string; readonly detail?: string;
    readonly kind?: (typeof APPROVAL_KINDS)[number]; readonly risk?: ApprovalRisk; readonly callback?: string;
  }
  | Common & { readonly type: 'approval-withdrawn'; readonly id: string }
  | Common & { readonly type: 'controls'; readonly verbs: ReadonlyArray<ControlVerb>; readonly callback?: string };

export type Parsed = { ok: true; event: IngestEvent } | { ok: false; error: string };

const ROOM_ID = /^[a-z][a-z0-9-]{0,40}$/;
const TASK_ID = /^[A-Za-z0-9._-]{1,64}$/;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const NEWLINE = /[\r\n]/;
const COMMON = ['type', 'name', 'role', 'at'];
const FIELDS: Readonly<Record<IngestEvent['type'], ReadonlyArray<string>>> = {
  status: [...COMMON, 'status', 'activity', 'room'],
  activity: [...COMMON, 'text'],
  task: [...COMMON, 'id', 'title', 'status', 'room', 'shared'],
  message: [...COMMON, 'text'],
  approval: [...COMMON, 'id', 'title', 'detail', 'kind', 'risk', 'callback'],
  'approval-withdrawn': [...COMMON, 'id'],
  controls: [...COMMON, 'callback', 'verbs'],
};
const LOOPBACK: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]']);

class Invalid extends Error {}

function text(body: Readonly<Record<string, unknown>>, key: string, max: number, opts: { required: boolean; multiline?: boolean }): string | undefined {
  const value = body[key];
  if (value === undefined && !opts.required) return undefined;
  if (typeof value !== 'string' || !value.trim()) throw new Invalid(`${key} must be a non-empty string`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Invalid(`${key} is longer than ${max} characters`);
  if (CONTROL.test(trimmed) || (!opts.multiline && NEWLINE.test(trimmed))) throw new Invalid(`${key} must be plain text${opts.multiline ? '' : ' on one line'}`);
  return trimmed;
}

function oneOf<T extends string>(body: Readonly<Record<string, unknown>>, key: string, allowed: ReadonlyArray<T>): T {
  const value = body[key];
  if (typeof value !== 'string' || !(allowed as ReadonlyArray<string>).includes(value)) throw new Invalid(`${key} must be one of ${allowed.join(', ')}`);
  return value as T;
}

function shaped(body: Readonly<Record<string, unknown>>, key: string, re: RegExp, hint: string): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !re.test(value)) throw new Invalid(`${key} must be ${hint}`);
  return value;
}

/** Where the decision is POSTed: https anywhere, plain http only on this machine, no credentials in the URL. */
function callbackUrl(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const bad = (): never => { throw new Invalid('callback must be an https URL (or http on 127.0.0.1/localhost) without credentials, up to 500 characters'); };
  if (typeof value !== 'string' || value.length > LIMITS.callback) return bad();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return bad();
  }
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname));
  return secure && !url.username && !url.password ? url.href : bad();
}

/** The verbs a `controls` event offers: distinct values of CONTROL_VERBS ([] withdraws them). */
function controlVerbs(value: unknown): ControlVerb[] {
  const ok = Array.isArray(value) && value.every((v) => (CONTROL_VERBS as ReadonlyArray<unknown>).includes(v)) && new Set(value).size === value.length;
  if (!ok) throw new Invalid(`verbs must be a list of distinct values from ${CONTROL_VERBS.join(', ')} (or [] to withdraw them)`);
  return [...(value as ControlVerb[])];
}

function eventTime(value: unknown, now: number): number {
  if (value === undefined) return now;
  const ms = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(ms)) throw new Invalid('at must be an ISO 8601 time like 2026-10-13T15:00:00Z');
  return Math.min(ms, now);
}

function common(body: Readonly<Record<string, unknown>>, now: number): Common {
  const name = text(body, 'name', LIMITS.name, { required: false });
  const role = text(body, 'role', LIMITS.role, { required: false });
  return { ...(name ? { name } : {}), ...(role ? { role } : {}), at: eventTime(body.at, now) };
}

function build(type: IngestEvent['type'], body: Readonly<Record<string, unknown>>, now: number): IngestEvent {
  const base = common(body, now);
  const room = shaped(body, 'room', ROOM_ID, 'a room id like ops');
  switch (type) {
    case 'status': {
      const activity = text(body, 'activity', LIMITS.activity, { required: false });
      return { ...base, type, status: oneOf(body, 'status', INGEST_STATUSES), ...(activity ? { activity } : {}), ...(room ? { room } : {}) };
    }
    case 'activity':
      return { ...base, type, text: text(body, 'text', LIMITS.activity, { required: true }) ?? '' };
    case 'message':
      return { ...base, type, text: text(body, 'text', LIMITS.text, { required: true, multiline: true }) ?? '' };
    case 'approval': {
      const detail = text(body, 'detail', LIMITS.detail, { required: false, multiline: true });
      const kind = body.kind === undefined ? undefined : oneOf(body, 'kind', APPROVAL_KINDS);
      const risk = body.risk === undefined ? undefined : oneOf(body, 'risk', APPROVAL_RISKS);
      const callback = callbackUrl(body.callback);
      return {
        ...base, type, id: shaped(body, 'id', TASK_ID, 'up to 64 letters, digits, dots, dashes or underscores') ?? missing('id'),
        title: text(body, 'title', LIMITS.title, { required: true }) ?? '',
        ...(detail ? { detail } : {}), ...(kind ? { kind } : {}), ...(risk ? { risk } : {}), ...(callback ? { callback } : {}),
      };
    }
    case 'approval-withdrawn':
      return { ...base, type, id: shaped(body, 'id', TASK_ID, 'up to 64 letters, digits, dots, dashes or underscores') ?? missing('id') };
    case 'controls': {
      const verbs = controlVerbs(body.verbs);
      const callback = callbackUrl(body.callback);
      if (verbs.length && !callback) throw new Invalid('callback is required with verbs: where the office POSTs control events');
      return { ...base, type, verbs, ...(callback ? { callback } : {}) };
    }
    case 'task': {
      if (body.shared !== undefined && typeof body.shared !== 'boolean') throw new Invalid('shared must be true or false');
      return {
        ...base, type, id: shaped(body, 'id', TASK_ID, 'up to 64 letters, digits, dots, dashes or underscores') ?? missing('id'),
        title: text(body, 'title', LIMITS.title, { required: true }) ?? '', status: oneOf(body, 'status', TASK_STATUSES),
        ...(room ? { room } : {}), ...(typeof body.shared === 'boolean' ? { shared: body.shared } : {}),
      };
    }
  }
}

function missing(key: string): never {
  throw new Invalid(`${key} is required`);
}

export function parseIngestEvent(body: unknown, now: number): Parsed {
  if (!isRecord(body)) return { ok: false, error: 'The body must be a JSON object' };
  const type = body.type;
  if (typeof type !== 'string' || !(INGEST_TYPES as ReadonlyArray<string>).includes(type)) {
    return { ok: false, error: `type must be one of ${INGEST_TYPES.join(', ')}` };
  }
  const kind = type as IngestEvent['type'];
  const unknown = Object.keys(body).find((k) => !FIELDS[kind].includes(k));
  if (unknown) return { ok: false, error: `unknown field "${unknown.slice(0, 40)}" for a ${kind} event` };
  try {
    return { ok: true, event: build(kind, body, now) };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message };
    throw error;
  }
}
