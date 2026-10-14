// The office service: reads every adapter, seats and composes the office, and routes room messages, chat and new
// tasks to the adapter that owns the room. The HTTP layer talks to agents only through this.
import type { ChatMessage, Task } from '../../../shared/contract.ts';
import type { AdapterSnapshot, AgentAdapter, AgentMessage } from '../adapters/types.ts';
import type { EpochSeconds } from '../hermes/types.ts';
import { scrubText } from '../domain/scrub.ts';
import { log, redact } from '../log.ts';
import { validateChatText } from '../validate.ts';
import { toTask, type AdapterReading } from './compose.ts';
import { buildOffice, type Office, type OfficeSetup } from './office.ts';
import type { Seating } from './seating.ts';
import { createControls } from './controls.ts';
import { createOfficeMeetings } from './meetings.ts';
import { createApprovalActions } from './approvalActions.ts';
import type { AuditLog } from '../audit/auditLog.ts';
import { refuseWrite } from './writes.ts';

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
export type RoomMessages = { messages: ChatMessage[]; reason?: string };
export type NewTaskInput = { roomId: string; title: unknown; assignee: unknown };

const EMPTY: AdapterSnapshot = Object.freeze({ agents: [], presence: {}, tasks: [], rooms: [] });
const USER_AUTHOR = 'you'; // the contract's id for the human at the keyboard

export function toChatMessage(m: AgentMessage, adapterId: string, seating: Seating): ChatMessage {
  const authorId = m.authorAgentId === undefined ? USER_AUTHOR : (seating.personOf(adapterId, m.authorAgentId) ?? m.authorAgentId);
  return { id: m.id, roomId: m.roomId, authorId, text: scrubText(m.text), at: m.at };
}

async function readAdapter(adapter: AgentAdapter): Promise<AdapterReading> {
  const summary = { id: adapter.id, kind: adapter.kind, label: adapter.label, capabilities: adapter.capabilities };
  try {
    return { adapter: summary, snapshot: await adapter.snapshot() };
  } catch (error) {
    log('adapter.snapshot_failed', { adapter: adapter.id, detail: redact(error instanceof Error ? error.message : String(error)) });
    return { adapter: summary, snapshot: EMPTY };
  }
}

export type OfficeServiceOptions = {
  readonly adapters: ReadonlyArray<AgentAdapter>;
  readonly setup: OfficeSetup;
  readonly now: () => EpochSeconds;
  readonly allowWrites: boolean; // DMOS_ALLOW_WRITES; every write also needs the adapter's capability flag
  readonly audit?: AuditLog | null; // approval decisions and control verbs are refused without one
};

export function createOfficeService(opts: OfficeServiceOptions) {
  const byId = new Map(opts.adapters.map((a) => [a.id, a]));

  async function read(): Promise<Office> {
    return buildOffice(await Promise.all(opts.adapters.map(readAdapter)), opts.setup, opts.now());
  }

  async function fresh(): Promise<Office> {
    for (const a of opts.adapters) a.invalidate?.();
    return read();
  }

  async function ownerOf(roomId: string): Promise<{ office: Office; adapter: AgentAdapter } | null> {
    const office = await read();
    const adapter = byId.get(office.roomOwners.get(roomId) ?? '');
    return adapter ? { office, adapter } : null;
  }

  async function messages(roomId: string, limit: number): Promise<RoomMessages | null> {
    const owner = await ownerOf(roomId);
    const page = owner ? await owner.adapter.readMessages(roomId, limit) : null;
    if (!owner || !page) return null;
    const out = page.messages.map((m) => toChatMessage(m, owner.adapter.id, owner.office.seating));
    return page.reason === undefined ? { messages: out } : { messages: out, reason: page.reason };
  }

  async function chat(roomId: string, rawText: unknown): Promise<ServiceResult<ChatMessage[]>> {
    const owner = await ownerOf(roomId);
    if (!owner) return { ok: false, status: 404, error: 'Unknown room' };
    const refused = refuseWrite(opts.allowWrites, owner.adapter, 'chat');
    if (refused || !owner.adapter.chat) return refused ?? { ok: false, status: 501, error: 'No chat' };
    const text = validateChatText(rawText);
    if (!text.ok) return { ok: false, status: 400, error: text.error };
    const result = await owner.adapter.chat(roomId, text.value);
    if (!result.ok) return result;
    return { ok: true, value: result.value.map((m) => toChatMessage(m, owner.adapter.id, owner.office.seating)) };
  }

  async function createTask(input: NewTaskInput): Promise<ServiceResult<Task>> {
    const owner = await ownerOf(input.roomId);
    if (!owner) return { ok: false, status: 400, error: 'Unknown room' };
    const refused = refuseWrite(opts.allowWrites, owner.adapter, 'createTask');
    if (refused || !owner.adapter.createTask) return refused ?? { ok: false, status: 501, error: 'No tasks' };
    const seating = owner.office.seating;
    const seat = typeof input.assignee === 'string'
      ? (seating.staff.get(input.assignee) ?? seating.temps.find((t) => t.personId === input.assignee))
      : undefined;
    const assigneeAgentId = seat && seat.adapterId === owner.adapter.id ? seat.agentId : input.assignee;
    const result = await owner.adapter.createTask({ roomId: input.roomId, title: input.title, assigneeAgentId });
    return result.ok ? { ok: true, value: toTask(result.value, owner.adapter.id, seating) } : result;
  }

  /** The Hermes profile seated at a person's desk (for the headshot fallback of portraits). */
  async function hermesProfileOf(personId: string): Promise<string | undefined> {
    const seat = (await read()).seating.staff.get(personId);
    return seat && byId.get(seat.adapterId)?.kind === 'hermes' ? seat.agentId : undefined;
  }

  function subscribe(listener: () => void): () => void {
    const offs = opts.adapters.flatMap((a) => (a.subscribe ? [a.subscribe(listener)] : []));
    return () => { for (const off of offs) off(); };
  }

  const controls = createControls({ adapters: opts.adapters, allowWrites: opts.allowWrites, fresh, audit: opts.audit ?? null });
  const { meetings } = createOfficeMeetings({ adapters: opts.adapters, read });
  const approvals = createApprovalActions({ adapters: opts.adapters, allowWrites: opts.allowWrites, read, fresh, audit: opts.audit ?? null });

  return { read, fresh, messages, chat, createTask, ...controls, ...approvals, meetings, hermesProfileOf, subscribe, adapters: opts.adapters };
}

export type OfficeService = ReturnType<typeof createOfficeService>;
