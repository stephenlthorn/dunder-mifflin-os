// The agent adapter contract. Everything the office knows about agents arrives through an AgentAdapter, and every
// action the office takes on an agent goes back through one. Adapters speak in their own agent ids (a Hermes profile
// key, a webhook agent id, a Claude Code project); which office character an agent becomes is decided outside them,
// by the seating (server/src/office/seating.ts, from ~/.dunder-mifflin-os/config.yaml). Adapters never see people.
//
// Invariants every adapter keeps (test/adapters/contractSuite.ts checks them):
//  - free text it returns (names, roles, activity, task titles, messages) is scrubbed (domain/scrub.ts): no tokens,
//    chat ids, phone numbers or home paths; no raw payloads, paths or secrets are kept;
//  - a capability flag is true exactly when the matching method exists, so the UI can hide what it can't do;
//  - room ids are global: the Hermes adapter keeps its historical ids (ops, council, dm-<profile>), every other
//    adapter prefixes its room ids with its own instance id ('webhook-deploy-bot');
//  - snapshots are immutable values: later events never change a snapshot already handed out.
import type { IncomingHttpHeaders } from 'node:http';
import type { AgentCapabilities, ApprovalRisk, ChatMessage, Meeting, MinutesLine, Presence, Room, ScheduledJob, Task } from '../../../shared/contract.ts';
import type { TimelineEvent } from '../../../shared/observability.ts';

export type AdapterKind = 'hermes' | 'webhook' | 'claude-code' | 'demo';
export const ADAPTER_KINDS: ReadonlyArray<AdapterKind> = Object.freeze(['hermes', 'webhook', 'claude-code', 'demo']);

/** Adapter instance ids: 'hermes', 'webhook', 'claude-code' or a custom id from the config. */
export const ADAPTER_ID = /^[a-z][a-z0-9-]{0,11}$/;
/** Agent ids within one adapter (Hermes profile keys fit). Webhook and Claude Code ids are at most 28 characters. */
export const AGENT_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

export const NO_CAPABILITIES: AgentCapabilities = Object.freeze({
  chat: false, createTask: false, approvals: false, pause: false, stop: false, runJob: false, reassign: false,
});

/** Roster entry: who the agent is. */
export type AgentInfo = {
  readonly id: string;
  readonly name?: string; // the agent's own name (a Hermes persona). Characters with `keepName` keep theirs.
  readonly role: string; // what it does, shown under the name
};

export type AgentTask = Omit<Task, 'ownerId'> & { readonly ownerAgentId?: string };

/** A room an adapter knows. areaId is optional: a direct line sits at its member's desk, other rooms default to the Conference Room. */
export type AgentRoom = Omit<Room, 'memberIds' | 'areaId' | 'adapter' | 'capabilities'> & {
  readonly areaId?: string;
  readonly memberAgentIds: ReadonlyArray<string>; // lead first
};

/** A chat message; no authorAgentId = written by the human user. */
export type AgentMessage = Omit<ChatMessage, 'authorId'> & { readonly authorAgentId?: string };

/** One reading of everything an adapter knows. Presence, tasks and jobs are keyed by agent id. */
export type AdapterSnapshot = {
  readonly agents: ReadonlyArray<AgentInfo>; // roster, in a stable order (first seen first)
  readonly presence: Readonly<Record<string, Presence>>; // one entry per agent
  readonly tasks: ReadonlyArray<AgentTask>;
  readonly rooms: ReadonlyArray<AgentRoom>;
  readonly jobs?: Readonly<Record<string, ReadonlyArray<ScheduledJob>>>;
  readonly approvals?: ReadonlyArray<ApprovalRequest>; // what agents wait on you for (adapters with the approvals flag)
  /** Per agent, flags this agent turns OFF (a webhook agent that gave no control callback). Never turns a flag on. */
  readonly capabilities?: Readonly<Record<string, Partial<AgentCapabilities>>>;
};

export type MessagesPage = { readonly messages: ReadonlyArray<AgentMessage>; readonly reason?: string };

export type ActionError = { readonly ok: false; readonly status: 400 | 404 | 409 | 429 | 501 | 502 | 504; readonly error: string };
export type ActionResult<T> = { readonly ok: true; readonly value: T } | ActionError;
/** What a control verb did, when the adapter has more to say than "done" ("Claude Code stops at its next step"). */
export type ControlDone = { readonly note?: string };
export type ControlResult = ActionResult<ControlDone | null>;

/**
 * Something an agent is waiting on you for (the approvals inbox at Toby's desk). `id` is unique within the adapter
 * (the office prefixes the adapter id). The agent need not be on the roster (a Hermes card assigned to a human).
 */
export type ApprovalRequest = {
  readonly id: string;
  readonly agentId: string;
  readonly kind: 'permission' | 'question' | 'task';
  readonly title: string;
  readonly detail?: string;
  readonly requestedAt: string; // ISO
  readonly risk?: ApprovalRisk; // default 'medium'
  readonly decidable?: boolean; // default true; false = shown only, answer it where the agent runs
  readonly actions?: { readonly approve: string; readonly reject: string }; // what each button does
};
export type ApprovalDecision = { readonly approve: boolean; readonly note?: string };

/** A period in epoch seconds, [from, to). */
export type Period = { readonly from: number; readonly to: number };

/**
 * A meeting (a shared task or a Council session) with its minutes, as an adapter sees it: agent ids instead of
 * people. Minutes are built from the record (cards, runs, comments, status changes), never by an LLM; free text is
 * scrubbed and truncated.
 */
export type AgentMeeting = Omit<Meeting, 'participantIds' | 'agenda' | 'lines'> & {
  readonly participantAgentIds: ReadonlyArray<string>; // chair / owner first
  readonly agenda: ReadonlyArray<{ readonly taskId: string; readonly title: string; readonly ownerAgentId?: string; readonly status: Task['status'] }>;
  readonly lines: ReadonlyArray<Omit<MinutesLine, 'personId'> & { readonly authorAgentId?: string }>;
};

export type TaskInput = { readonly roomId: string; readonly title: unknown; readonly assigneeAgentId: unknown };

/** Timeline reads: events at or after `since` (ISO), newest first, at most `limit`. */
export type TimelineQuery = { readonly since: string; readonly limit: number };
/** A usage window, ISO times: [from, to). The office turns 'today' / '7d' / '30d' into one (usage/periods.ts). */
export type UsageWindow = { readonly from: string; readonly to: string };
/** A cost the agent itself recorded (Hermes' cost columns). `included` = covered by a subscription. */
export type RecordedCost = { readonly amount: number; readonly kind: 'actual' | 'estimated' | 'included' };
/** Tokens one model used in a window. Adapters report tokens; the office prices them (usage/pricing.ts). */
export type ModelTokens = {
  readonly model: string;
  readonly inputTokens: number; // uncached input
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly reasoningTokens: number; // already counted in outputTokens; informational
  readonly calls?: number;
  readonly recordedCost?: RecordedCost; // USD
};
export type AgentUsage = { readonly models: ReadonlyArray<ModelTokens> };

/** An inbound HTTP endpoint an adapter adds (webhook ingest, Claude Code hooks). POST + JSON only. */
/** `signal` aborts when the caller hangs up (a held Claude Code PermissionRequest whose hook timed out). */
export type InboundRequest = { readonly params: ReadonlyArray<string>; readonly body: unknown; readonly signal?: AbortSignal };
export type InboundResponse = { readonly status: number; readonly body?: unknown; readonly headers?: Readonly<Record<string, string>> };
export type InboundRoute = {
  readonly pattern: RegExp; // matched against the whole path, e.g. /^\/api\/ingest\/([^/]+)$/
  readonly maxBodyBytes: number;
  /** Checked before the body is read; false = 401. */
  authorize(headers: IncomingHttpHeaders): boolean;
  handle(req: InboundRequest): InboundResponse | Promise<InboundResponse>;
};

export interface AgentAdapter {
  readonly id: string;
  readonly kind: AdapterKind;
  readonly label: string; // 'Hermes', 'Webhook', 'Claude Code', 'Demo'
  readonly capabilities: AgentCapabilities;
  /** Roster, presence, tasks, rooms (and scheduled jobs) right now. Never throws: unreadable sources degrade. */
  snapshot(): Promise<AdapterSnapshot>;
  /** Drop any cached reading so the next snapshot() is fresh (the SSE poller calls this). */
  invalidate?(): void;
  /** Push adapters call the listener when something changed; returns an unsubscribe function. */
  subscribe?(listener: () => void): () => void;
  /** A room's recent messages, oldest first; null when the room isn't this adapter's. */
  readMessages(roomId: string, limit: number): Promise<MessagesPage | null>;
  // Optional actions, each declared by its capability flag.
  chat?(roomId: string, text: string): Promise<ActionResult<ReadonlyArray<AgentMessage>>>;
  createTask?(input: TaskInput): Promise<ActionResult<AgentTask>>;
  listApprovals?(): Promise<ReadonlyArray<ApprovalRequest>>;
  resolveApproval?(id: string, decision: ApprovalDecision): Promise<ActionResult<null>>;
  /** Optional, read-only (no capability flag): meetings active in a period with their minutes, newest first. */
  meetings?(period: Period): Promise<ReadonlyArray<AgentMeeting>>;
  // Control verbs. The office has checked writes, the flag, the arguments against a fresh snapshot and
  // written the audit entry before it calls one of these.
  pause?(agentId: string): Promise<ControlResult>;
  resume?(agentId: string): Promise<ControlResult>;
  /** Stop its current run; `taskId` names the card when the adapter runs cards. */
  stop?(agentId: string, target?: { readonly taskId?: string }): Promise<ControlResult>;
  /** Run a scheduled job now; `jobId` is the ScheduledJob.id this adapter reported. */
  runJob?(agentId: string, jobId: string): Promise<ControlResult>;
  /** Hand a card (a task id this adapter reported) to another of its agents. */
  reassign?(agentId: string, taskId: string, toAgentId: string): Promise<ControlResult>;
  // Optional reads (no capability flag: the office answers "No timeline/usage data from <label>" when absent).
  /** What the agent did, newest first; free text short and scrubbed, tasks by title only. null = unknown agent. */
  timeline?(agentId: string, query: TimelineQuery): Promise<ReadonlyArray<TimelineEvent> | null>;
  /** Tokens per model in a window, with any cost the agent recorded. null = unknown agent or no usage source. */
  usage?(agentId: string, window: UsageWindow): Promise<AgentUsage | null>;
  readonly routes?: ReadonlyArray<InboundRoute>;
  close?(): Promise<void>;
}

/** Which methods each capability flag promises. */
export const CAPABILITY_METHODS: Readonly<Record<keyof AgentCapabilities, ReadonlyArray<keyof AgentAdapter>>> = Object.freeze({
  chat: ['chat'],
  createTask: ['createTask'],
  approvals: ['listApprovals', 'resolveApproval'],
  pause: ['pause', 'resume'],
  stop: ['stop'],
  runJob: ['runJob'],
  reassign: ['reassign'],
});
