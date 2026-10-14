// Validation at the browser's data boundary: everything from /api is untrusted until it passes these guards.
import type {
  AdapterInfo, AgentCapabilities, Approval, Capabilities, ChatMessage, HairStyle, Look, OfficeSnapshot, Person, Presence, Room, ScheduledJob, Task,
} from '@shared/contract';
import type { OfficeEvent } from './merge';

const MAX_TEXT = 500;
type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = MAX_TEXT): string | undefined => (typeof v === 'string' ? v.slice(0, max) : undefined);
const reqStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): v is T => typeof v === 'string' && (allowed as readonly string[]).includes(v);
const compact = <T extends Obj>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

const STATUSES = ['working', 'idle', 'offline', 'error', 'meeting', 'needs-input', 'no-bot'] as const;
const HAIR: readonly HairStyle[] = ['short', 'side-part', 'center-part', 'bald', 'balding', 'bun', 'ponytail', 'long', 'curly', 'bob', 'buzz', 'grey-wild'];
const BUILDS = ['slim', 'average', 'large'] as const;
const ROOM_KINDS = ['ops', 'team', 'dm', 'common'] as const;
const TASK_STATUSES = ['todo', 'doing', 'blocked', 'done'] as const;
const COLOR = /^#[0-9a-f]{3,8}$/i;
const color = (v: unknown) => (typeof v === 'string' && COLOR.test(v) ? v : undefined);
const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);

function parseLook(v: unknown): Look | null {
  if (!isObj(v) || !color(v.skin) || !color(v.hair) || !color(v.shirt) || !oneOf(v.hairStyle, HAIR)) return null;
  return compact({
    skin: color(v.skin)!, hair: color(v.hair)!, hairStyle: v.hairStyle, shirt: color(v.shirt)!,
    tie: color(v.tie), jacket: color(v.jacket), cardigan: color(v.cardigan), belt: color(v.belt),
    glasses: bool(v.glasses), mustache: bool(v.mustache), beard: bool(v.beard), robot: bool(v.robot),
    build: oneOf(v.build, BUILDS) ? v.build : undefined,
  });
}

const AGENT_CAPABILITY_FLAGS = ['chat', 'createTask', 'approvals', 'pause', 'stop'] as const;

/** All five flags must be booleans; anything else is dropped (the UI then assumes Hermes defaults). runJob and reassign
 *  (control verbs) are optional: absent or not a boolean = no. */
function parseAgentCapabilities(v: unknown): AgentCapabilities | undefined {
  if (!isObj(v) || !AGENT_CAPABILITY_FLAGS.every((k) => typeof v[k] === 'boolean')) return undefined;
  return compact({
    chat: v.chat as boolean, createTask: v.createTask as boolean, approvals: v.approvals as boolean, pause: v.pause as boolean, stop: v.stop as boolean,
    runJob: bool(v.runJob), reassign: bool(v.reassign),
  });
}

function parseBot(v: unknown): Person['bot'] {
  if (!isObj(v) || !reqStr(v.profile)) return undefined;
  return compact({ profile: str(v.profile, 64)!, role: str(v.role) ?? '', adapter: str(v.adapter, 40), capabilities: parseAgentCapabilities(v.capabilities) });
}

function parseAdapter(v: unknown): AdapterInfo | null {
  const capabilities = isObj(v) ? parseAgentCapabilities(v.capabilities) : undefined;
  if (!isObj(v) || !reqStr(v.id) || !reqStr(v.kind) || !capabilities) return null;
  const agents = typeof v.agents === 'number' && Number.isFinite(v.agents) ? v.agents : 0;
  return { id: str(v.id, 40)!, kind: str(v.kind, 40)!, label: str(v.label, 80) ?? v.id, capabilities, agents };
}

function parsePerson(v: unknown): Person | null {
  if (!isObj(v) || !reqStr(v.id) || !reqStr(v.name) || !reqStr(v.seatId)) return null;
  const look = parseLook(v.look);
  if (!look) return null;
  const bot = parseBot(v.bot);
  return compact({ id: v.id, name: str(v.name, 120)!, title: str(v.title, 120) ?? '', seatId: v.seatId, bot, persona: str(v.persona, 120), look });
}

function parsePresence(v: unknown): Presence | null {
  if (!isObj(v) || !oneOf(v.status, STATUSES)) return null;
  return compact({ status: v.status, activity: str(v.activity), since: str(v.since, 40), roomId: str(v.roomId, 80) });
}

function parseRoom(v: unknown): Room | null {
  if (!isObj(v) || !reqStr(v.id) || !reqStr(v.name) || !reqStr(v.areaId) || !oneOf(v.kind, ROOM_KINDS)) return null;
  const memberIds = Array.isArray(v.memberIds) ? v.memberIds.filter(reqStr) : [];
  return compact({
    id: v.id, name: str(v.name, 120)!, areaId: v.areaId, kind: v.kind, hermesRoom: str(v.hermesRoom, 80), memberIds,
    adapter: str(v.adapter, 40), capabilities: parseAgentCapabilities(v.capabilities),
  });
}

function parseTask(v: unknown): Task | null {
  if (!isObj(v) || !reqStr(v.id) || !reqStr(v.title) || !oneOf(v.status, TASK_STATUSES)) return null;
  return compact({
    id: v.id, title: str(v.title)!, status: v.status, ownerId: str(v.ownerId, 80), roomId: str(v.roomId, 80),
    shared: v.shared === true, updatedAt: str(v.updatedAt, 40) ?? '',
  });
}

const APPROVAL_KINDS = ['permission', 'question', 'task'] as const;
const RISKS = ['low', 'medium', 'high'] as const;

function parseApproval(v: unknown): Approval | null {
  if (!isObj(v) || !reqStr(v.id) || !reqStr(v.adapter) || !reqStr(v.from) || !reqStr(v.title) || !reqStr(v.requestedAt)) return null;
  if (!oneOf(v.kind, APPROVAL_KINDS) || !oneOf(v.risk, RISKS) || typeof v.decidable !== 'boolean') return null;
  const actions = isObj(v.actions) && reqStr(v.actions.approve) && reqStr(v.actions.reject)
    ? { approve: str(v.actions.approve, 80)!, reject: str(v.actions.reject, 80)! } : undefined;
  return compact({
    id: str(v.id, 160)!, adapter: str(v.adapter, 40)!, personId: str(v.personId, 80), from: str(v.from, 120)!, kind: v.kind,
    title: str(v.title, 300)!, detail: str(v.detail, 1000), requestedAt: str(v.requestedAt, 40)!, risk: v.risk, decidable: v.decidable, actions,
  });
}

const JOB_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/; // opaque; sent back as-is to run the job now

function parseJob(v: unknown): ScheduledJob | null {
  if (!isObj(v) || !reqStr(v.name) || typeof v.schedule !== 'string' || typeof v.enabled !== 'boolean') return null;
  return compact({
    id: typeof v.id === 'string' && JOB_ID.test(v.id) ? v.id : undefined,
    name: str(v.name, 120)!, schedule: str(v.schedule, 120)!, enabled: v.enabled,
    lastRunAt: str(v.lastRunAt, 40), lastStatus: str(v.lastStatus, 120), nextRunAt: str(v.nextRunAt, 40),
  });
}

function jobsMap(v: unknown): Record<string, ScheduledJob[]> | undefined {
  if (!isObj(v)) return undefined;
  return Object.fromEntries(Object.entries(v).flatMap(([id, jobs]) => (Array.isArray(jobs) ? [[id, list(jobs, parseJob)]] : [])));
}

const list = <T>(v: unknown, parse: (x: unknown) => T | null): T[] =>
  Array.isArray(v) ? v.map(parse).filter((x): x is T => x !== null) : [];

function presenceMap(v: unknown): Record<string, Presence> {
  if (!isObj(v)) return {};
  return Object.fromEntries(
    Object.entries(v).flatMap(([id, p]) => {
      const parsed = parsePresence(p);
      return parsed ? [[id, parsed]] : [];
    }),
  );
}

/** Writes are on only for a literal `true`; anything else from the server means read-only. */
const parseCapabilities = (v: unknown): Capabilities | undefined => (isObj(v) ? { writes: v.writes === true } : undefined);

export function parseSnapshot(v: unknown): OfficeSnapshot | null {
  if (!isObj(v) || !Array.isArray(v.people) || !isObj(v.presence) || !Array.isArray(v.rooms) || !Array.isArray(v.tasks)) return null;
  const jobs = jobsMap(v.jobs);
  const capabilities = parseCapabilities(v.capabilities);
  const adapters = Array.isArray(v.adapters) ? list(v.adapters, parseAdapter) : undefined;
  const approvals = Array.isArray(v.approvals) ? list(v.approvals, parseApproval) : undefined;
  return {
    generatedAt: str(v.generatedAt, 40) ?? new Date().toISOString(),
    people: list(v.people, parsePerson),
    presence: presenceMap(v.presence),
    rooms: list(v.rooms, parseRoom),
    tasks: list(v.tasks, parseTask),
    ...(jobs ? { jobs } : {}),
    ...(capabilities ? { capabilities } : {}),
    ...(adapters ? { adapters } : {}),
    ...(approvals ? { approvals } : {}),
  };
}

export function parseEvent(v: unknown): OfficeEvent | null {
  let raw = v;
  if (typeof v === 'string') {
    try {
      raw = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!isObj(raw)) return null;
  return {
    ...(isObj(raw.presence) ? { presence: presenceMap(raw.presence) } : {}),
    ...(Array.isArray(raw.tasks) ? { tasks: list(raw.tasks, parseTask) } : {}),
    ...(Array.isArray(raw.approvals) ? { approvals: list(raw.approvals, parseApproval) } : {}),
  };
}

function parseMessage(v: unknown): ChatMessage | null {
  if (!isObj(v) || !reqStr(v.id) || !reqStr(v.roomId) || !reqStr(v.authorId) || typeof v.text !== 'string') return null;
  return { id: v.id, roomId: v.roomId, authorId: v.authorId, text: v.text.slice(0, 4000), at: str(v.at, 40) ?? '' };
}

/** Accepts a bare array or a `{ messages: [...] }` envelope. */
export function parseMessages(v: unknown): ChatMessage[] {
  const arr = Array.isArray(v) ? v : isObj(v) ? v.messages : undefined;
  return list(arr, parseMessage);
}

/** The reply to POST /api/chat: a ChatMessage, or `{ message: ChatMessage }`. Anything else → null. */
export function parseSentMessage(v: unknown): ChatMessage | null {
  return parseMessage(isObj(v) && isObj(v.message) ? v.message : v);
}
