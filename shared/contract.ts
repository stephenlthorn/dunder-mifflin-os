// The data contract between the server and the browser. Both sides import it: keep changes additive.

// 'needs-input' = waiting on you (a permission prompt, a question, an approval). Added with the agent adapter layer.
export type BotStatus = 'working' | 'idle' | 'offline' | 'error' | 'meeting' | 'needs-input';

/**
 * What the OS can do with an agent (or a room's lead agent), declared by the agent's adapter, so the UI can hide what
 * an adapter can't do. Absent on data from servers that predate adapters: treat that as Hermes (chat + createTask).
 * Per agent; not to be confused with a server-wide switch such as read-only mode.
 */
export type AgentCapabilities = {
  chat: boolean; // send it a message (person window composer, room chat)
  createTask: boolean; // create a shared task assigned to it
  approvals: boolean; // list / approve / reject what it is waiting on
  pause: boolean; // pause and resume it
  stop: boolean; // stop its current run
  runJob?: boolean; // run one of its scheduled jobs now (absent = no)
  reassign?: boolean; // hand one of its cards to another agent of the same adapter (absent = no)
};

/** One agent source the server runs (server/src/adapters): Hermes, a webhook, Claude Code hooks, ... */
export type AdapterInfo = { id: string; kind: string; label: string; capabilities: AgentCapabilities; agents: number };

export type Presence = {
  status: BotStatus | 'no-bot';
  activity?: string;
  since?: string; // ISO time
  roomId?: string; // where the person is now, when not at their desk
};

/** How much damage saying yes could do, as the agent's adapter judges it. */
export type ApprovalRisk = 'low' | 'medium' | 'high';

/** Something an agent is waiting on you for (the approvals inbox at Toby's HR desk). */
export type Approval = {
  id: string; // '<adapter id>:<the adapter's own id>'; POST /api/approvals/:id decides it
  adapter: string; // AdapterInfo.id
  personId?: string; // who is asking; absent for an agent without a desk
  from: string; // display name of who is asking (the person, or the agent id)
  kind: 'permission' | 'question' | 'task';
  title: string; // what
  detail?: string; // why (or the command / file it is about)
  requestedAt: string; // ISO; since
  risk: ApprovalRisk;
  decidable: boolean; // false: answer it where the agent runs (the office only shows it)
  actions?: { approve: string; reject: string }; // what each button does, e.g. "Unblock the card"
};

export type HairStyle =
  | 'short' | 'side-part' | 'center-part' | 'bald' | 'balding' | 'bun' | 'ponytail'
  | 'long' | 'curly' | 'bob' | 'buzz' | 'grey-wild';

export type Look = {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  shirt: string;
  tie?: string;
  jacket?: string;
  cardigan?: string;
  glasses?: boolean;
  mustache?: boolean;
  beard?: boolean;
  build?: 'slim' | 'average' | 'large';
  robot?: boolean; // Jarvis
  belt?: string; // a belt round the waist (Sensei Ira's black belt over his gi)
};

export type Person = {
  id: string;
  name: string;
  title: string;
  seatId: string;
  // profile = the agent's id within its adapter (a Hermes profile key for Hermes); adapter = AdapterInfo.id
  bot?: { profile: string; role: string; adapter?: string; capabilities?: AgentCapabilities };
  persona?: string; // the bot's Hermes persona name, when the map keeps its own name instead (staff `keepName`)
  look: Look;
};

export type Room = {
  id: string;
  name: string;
  areaId: string;
  kind: 'ops' | 'team' | 'dm' | 'common';
  hermesRoom?: string;
  memberIds: string[];
  adapter?: string; // AdapterInfo.id of the adapter that owns the room
  capabilities?: AgentCapabilities; // what the room's lead agent can do (chat, createTask, ...)
};

export type Task = {
  id: string;
  title: string;
  status: 'todo' | 'doing' | 'blocked' | 'done';
  ownerId?: string;
  roomId?: string;
  shared: boolean;
  updatedAt: string;
};

/** How a job repeats, when its adapter knows. `once.at` is ISO, or a local time (no offset) in the job's zone. */
export type ScheduleRule =
  | { kind: 'cron'; expr: string } // 5-field cron
  | { kind: 'interval'; minutes: number }
  | { kind: 'once'; at: string };

export type ScheduledJob = {
  name: string;
  schedule: string;
  enabled: boolean;
  lastRunAt?: string; // ISO
  lastStatus?: string;
  nextRunAt?: string; // ISO
  id?: string; // opaque job reference for "run now" (POST /api/people/:id/actions); absent = can't be run from here
  rule?: ScheduleRule; // absent: `schedule` is read as cron / "every 5m" text when it is one
  timeZone?: string; // IANA zone the rule runs in; absent = the server's zone
};

/** One run of a job on the Party Planning Committee calendar. `missed` = it was due after the last run and didn't run. */
export type CalendarRun = 'ok' | 'failed' | 'unknown' | 'missed' | 'upcoming';
export type CalendarJob = {
  key: string; // stable within one response
  personId: string;
  name: string;
  schedule: string;
  repeats: 'cron' | 'interval' | 'once' | 'unknown';
  enabled: boolean;
  timeZone: string;
  lastRunAt?: string;
  lastStatus?: string;
  nextRunAt?: string;
};
export type Occurrence = { jobKey: string; at: string; run: CalendarRun; nextUp?: boolean; offSchedule?: boolean };
/** GET /api/schedule?from&to: every scheduled job in the office, expanded into runs in [from, to). */
export type ScheduleView = {
  from: string;
  to: string;
  generatedAt: string;
  timeZone: string; // the server's zone (jobs without their own)
  jobs: CalendarJob[];
  occurrences: Occurrence[]; // sorted by time
  nextUp?: { jobKey: string; at: string }; // the soonest run after now, even outside [from, to)
  truncated?: boolean;
};

/** A line of Conference Room minutes, built from the kanban record (no LLM). */
export type MinutesLine = {
  at: string;
  kind: 'opened' | 'started' | 'status' | 'comment' | 'result' | 'closed';
  personId?: string; // who, when it was a bot at a desk
  author?: string; // who, otherwise ('You', 'worker')
  text: string;
};
export type MeetingStatus = 'scheduled' | 'in-session' | 'blocked' | 'adjourned';
export type Meeting = {
  id: string;
  kind: 'council' | 'shared-task';
  title: string;
  roomId: string;
  status: MeetingStatus;
  startedAt: string;
  endedAt?: string;
  participantIds: string[]; // chair / owner first
  agenda: { taskId: string; title: string; ownerId?: string; status: Task['status'] }[];
  lines: MinutesLine[]; // oldest first
  truncated?: boolean;
};
/** GET /api/meetings?from&to: shared tasks and Council sessions active in [from, to), newest first. */
export type MeetingsView = { from: string; to: string; generatedAt: string; meetings: Meeting[] };

/**
 * What this server allows. `writes`: chat, task creation and any other write (off unless DMOS_ALLOW_WRITES=1).
 * A write to an agent needs this AND the agent's AgentCapabilities flag.
 */
export type Capabilities = {
  writes: boolean;
};

export type OfficeSnapshot = {
  generatedAt: string;
  people: Person[];
  presence: Record<string, Presence>;
  rooms: Room[];
  tasks: Task[];
  jobs?: Record<string, ScheduledJob[]>; // by person id
  capabilities?: Capabilities; // server-wide; absent (older server, demo data) = read-only in live mode
  adapters?: AdapterInfo[]; // agent sources; each bot and room also carries its adapter's AgentCapabilities
  approvals?: Approval[]; // pending, newest first; absent from servers without approvals
};

export type ChatMessage = {
  id: string;
  roomId: string;
  authorId: string | 'you'; // 'you' = the human at the keyboard
  text: string;
  at: string;
};
