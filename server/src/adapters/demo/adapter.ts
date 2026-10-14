// The `demo` adapter, "Threat Level Midnight": a scripted, fictional office day (shared/demo) on a clock that runs at
// 1x, 10x or 60x and loops at 17:30. No keys, no ~/.hermes, no network. Chat answers with canned in-character lines
// and new shared tasks live in memory, as do the control verbs (stop a card, run a job now, reassign; controls.ts) and
// the scripted usage behind Angela's ledger and Corporate's budgets (usage.ts). Deterministic for a given start, speed and seed. The same module runs in the
// browser for the static demo (web/src/demo/static), so both show exactly the same day.
import type { Presence } from '../../../../shared/contract.ts';
import { DEMO_CAST, DEMO_ROOMS, DEMO_TASK_ROOM, type DemoRoom } from '../../../../shared/demo/cast.ts';
import { clockView, dayAt, minuteAt, realMsAtMinute, startClock, withSpeed, type DemoClockView } from '../../../../shared/demo/clock.ts';
import { cannedReply } from '../../../../shared/demo/replies.ts';
import { dayStateAt, messagesUpTo, nextChangeAfter, type DemoPresence } from '../../../../shared/demo/state.ts';
import { straysAt } from '../../../../shared/demo/strays.ts';
import { dayTimeline } from '../../../../shared/demo/timeline.ts';
import { DAY_END, DAY_START, DEFAULT_SEED, DEFAULT_SPEED, DEFAULT_START, isoAt, parseSpeed, type DemoSpeed } from '../../../../shared/demo/time.ts';
import { validateChatText, validateTaskTitle } from '../../validate.ts';
import type { ActionResult, AdapterSnapshot, AgentAdapter, AgentMessage, AgentRoom, AgentTask, ControlResult, TimelineQuery } from '../types.ts';
import {
  type ControlMemory, addRun, controlsFor, emptyControls, handOver, nextControlChange, runningNow, stopTask, withJobControls, withRunPresence,
  withTaskControls,
} from './controls.ts';
import { demoUsage } from './usage.ts';
import { addChats, addTask, emptyMemory, memoryFor, nextTaskChange, sentTo, taskStatusAt, type Memory } from './memory.ts';

export type DemoAdapterOptions = {
  readonly id?: string;
  readonly speed?: DemoSpeed;
  readonly start?: number; // office minute the clock starts at (default 08:55)
  readonly seed?: number;
  readonly now?: () => number; // epoch ms
  readonly replyDelayMs?: number; // how long a bot "types" before its canned reply
};

export type DemoControls = {
  clock(): DemoClockView;
  setSpeed(speed: unknown): ActionResult<DemoClockView>;
};
export type DemoAdapter = AgentAdapter & { readonly demo: DemoControls };

export const isDemoAdapter = (a: AgentAdapter): a is DemoAdapter => a.kind === 'demo' && 'demo' in a;

const REPLY_GAP_MINUTES = 0.5;
const MAX_TIMER_MS = 60_000;
const AGENTS: ReadonlySet<string> = new Set(DEMO_CAST.map((c) => c.agent));
const delay = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

export function createDemoAdapter(opts: DemoAdapterOptions = {}): DemoAdapter {
  const id = opts.id ?? 'demo';
  const now = opts.now ?? Date.now;
  const seed = opts.seed ?? DEFAULT_SEED;
  const roomId = (key: string) => `${id}-${key}`;
  const roomOf = (globalId: string): DemoRoom | undefined => DEMO_ROOMS.find((r) => roomId(r.key) === globalId);
  let clock = startClock(now(), opts.start ?? DEFAULT_START, opts.speed ?? DEFAULT_SPEED);
  let memory: Memory = emptyMemory(0);
  let controls: ControlMemory = emptyControls(0);
  let listeners: ReadonlySet<() => void> = new Set();
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** The office right now: minute, loop number and today's memory (older days' memory is dropped). */
  function today() {
    const t = now();
    memory = memoryFor(memory, dayAt(clock, t));
    controls = controlsFor(controls, dayAt(clock, t));
    return { t, minute: minuteAt(clock, t), memory };
  }

  function presenceOf(agent: string, p: DemoPresence, minute: number, mem: Memory): Presence {
    const busy = mem.tasks.map((task) => ({ task, id: roomId(`new-${mem.day}-${task.seq}`), at: taskStatusAt(task, minute) }))
      .find((x) => (controls.owners[x.id] ?? x.task.owner) === agent && x.at.status === 'doing' && controls.stopped[x.id] === undefined);
    if (busy && (p.status === 'idle' || p.status === 'working')) {
      return { status: 'meeting', activity: busy.task.title, since: isoAt(busy.at.since), roomId: roomId(busy.task.room) };
    }
    return { status: p.status, ...(p.activity ? { activity: p.activity } : {}), since: p.since, ...(p.room ? { roomId: roomId(p.room) } : {}) };
  }

  function userTasks(mem: Memory, minute: number): AgentTask[] {
    return mem.tasks.map((task) => {
      const at = taskStatusAt(task, minute);
      return { id: roomId(`new-${mem.day}-${task.seq}`), title: task.title, status: at.status, ownerAgentId: task.owner, roomId: roomId(task.room), shared: true, updatedAt: isoAt(at.since) };
    });
  }

  async function snapshot(): Promise<AdapterSnapshot> {
    const { minute, memory: mem } = today();
    const day = dayStateAt(minute, seed);
    const rooms = DEMO_ROOMS.map((r): AgentRoom => ({ id: roomId(r.key), name: r.name, kind: r.kind, ...(r.area ? { areaId: r.area } : {}), memberAgentIds: [...r.members] }));
    const tasks = day.tasks.map((t): AgentTask => ({
      id: roomId(t.id), title: t.title, status: t.status, ownerAgentId: t.owner, ...(t.room ? { roomId: roomId(t.room) } : {}), shared: t.shared, updatedAt: t.updatedAt,
    }));
    const strays = straysAt(minute).map((t): AgentTask => ({ // nobody's cards, in no room: Creed's corner
      id: roomId(`stray-${t.key}`), title: t.title, status: t.status, shared: false, updatedAt: t.updatedAt,
    }));
    return {
      agents: DEMO_CAST.map((c) => ({ id: c.agent, role: c.role })),
      presence: Object.fromEntries(Object.entries(day.presence).map(([a, p]) => [a, withRunPresence(a, presenceOf(a, p, minute, mem), controls, minute)])),
      tasks: withTaskControls([...tasks, ...strays, ...userTasks(mem, minute)], controls),
      rooms,
      jobs: withJobControls(day.jobs, controls, minute),
    };
  }

  async function readMessages(globalId: string, limit: number) {
    const room = roomOf(globalId);
    if (!room) return null;
    const { minute, memory: mem } = today();
    const scripted = messagesUpTo(minute).filter((m) => m.room === room.key).map((m) => ({ ...m, key: m.id }));
    const yours = mem.chats.filter((c) => c.room === room.key).map((c) => ({ ...c, key: `${c.from ? 're' : 'you'}-${mem.day}-${c.seq}` }));
    const messages = [...scripted, ...yours].sort((a, b) => a.at - b.at).slice(-Math.max(0, limit)).map((m): AgentMessage => ({
      id: roomId(m.key), roomId: globalId, ...(m.from ? { authorAgentId: m.from } : {}), text: m.text, at: isoAt(m.at),
    }));
    return messages.length ? { messages } : { messages, reason: 'Nothing said here yet today.' };
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    if (listeners.size === 0) return;
    const { t, minute, memory: mem } = today();
    const next = Math.min(nextChangeAfter(minute, seed), nextTaskChange(mem, minute) ?? DAY_END, nextControlChange(controls, minute) ?? DAY_END);
    const at = realMsAtMinute(clock, t, next >= DAY_END ? DAY_START : next);
    timer = setTimeout(() => { timer = null; notify(); schedule(); }, Math.min(Math.max(at - t + 5, 20), MAX_TIMER_MS));
    (timer as { unref?: () => void }).unref?.();
  }

  async function chat(globalId: string, text: string): Promise<ActionResult<ReadonlyArray<AgentMessage>>> {
    const room = roomOf(globalId);
    if (!room) return { ok: false, status: 404, error: 'Unknown room' };
    const valid = validateChatText(text);
    if (!valid.ok) return { ok: false, status: 400, error: valid.error };
    const { minute, memory: mem } = today();
    const lead = room.members[0] ?? '';
    const reply = cannedReply(lead, sentTo(mem, room.key), seed);
    memory = addChats(mem, [{ room: room.key, text: valid.value, at: minute }, { room: room.key, from: lead, text: reply, at: minute + REPLY_GAP_MINUTES }]);
    await delay(opts.replyDelayMs ?? 700);
    const seq = memory.seq;
    return { ok: true, value: [{ id: roomId(`re-${memory.day}-${seq}`), roomId: globalId, authorAgentId: lead, text: reply, at: isoAt(minute + REPLY_GAP_MINUTES) }] };
  }

  async function createTask(input: { roomId: string; title: unknown; assigneeAgentId: unknown }): Promise<ActionResult<AgentTask>> {
    if (input.roomId !== roomId(DEMO_TASK_ROOM)) return { ok: false, status: 400, error: 'Shared tasks can only be created from the Ops room' };
    if (typeof input.assigneeAgentId !== 'string' || !AGENTS.has(input.assigneeAgentId)) return { ok: false, status: 400, error: 'assignee must be one of the demo bots' };
    const title = validateTaskTitle(input.title);
    if (!title.ok) return { ok: false, status: 400, error: title.error };
    const { minute, memory: mem } = today();
    const added = addTask(mem, { title: title.value, owner: input.assigneeAgentId, room: DEMO_TASK_ROOM, at: minute });
    if (!added) return { ok: false, status: 429, error: 'That is enough new tasks for today; the day starts over at 17:30' };
    memory = added.memory;
    schedule();
    notify();
    const created = userTasks(memory, minute).at(-1);
    return created ? { ok: true, value: created } : { ok: false, status: 400, error: 'Task not created' };
  }

  /** After a control verb: tell the office now, and wake up when a run you started ends. */
  function changed(): void {
    schedule();
    notify();
  }

  async function stop(agent: string, target?: { readonly taskId?: string }): Promise<ControlResult> {
    const doing = (await snapshot()).tasks.filter((t) => t.ownerAgentId === agent && t.status === 'doing');
    const task = target?.taskId ? doing.find((t) => t.id === target.taskId) : doing.length === 1 ? doing[0] : undefined;
    if (target?.taskId && !task) return { ok: false, status: 409, error: 'That card is not running' };
    if (!task) return { ok: false, status: 409, error: doing.length ? 'Several cards are running; stop one from its card' : 'Nothing of this bot is running' };
    controls = stopTask(controls, task.id, today().minute);
    changed();
    return { ok: true, value: { note: `Stopped “${task.title}”; it stays parked as blocked for the rest of the demo day.` } };
  }

  async function runJob(agent: string, jobId: string): Promise<ControlResult> {
    const job = (await snapshot()).jobs?.[agent]?.find((j) => j.id === jobId);
    if (!job) return { ok: false, status: 404, error: 'No such job for this bot' };
    if (!job.enabled) return { ok: false, status: 409, error: 'That job is switched off' };
    const { minute } = today();
    if (runningNow(controls, agent, minute, jobId)) return { ok: false, status: 409, error: 'That job is already running' };
    controls = addRun(controls, { agent, job: jobId, name: job.name, at: minute });
    changed();
    return { ok: true, value: null };
  }

  async function reassign(agent: string, taskId: string, to: string): Promise<ControlResult> {
    if (to === agent || !AGENTS.has(to)) return { ok: false, status: 400, error: 'Pick another demo bot' };
    const task = (await snapshot()).tasks.find((t) => t.id === taskId && t.ownerAgentId === agent && t.status !== 'done');
    if (!task) return { ok: false, status: 409, error: 'That card is not this bot’s, or it is done' };
    controls = handOver(controls, taskId, to);
    changed();
    return { ok: true, value: null };
  }

  /** The script up to now. `since` is real time; the window it spans counts back from office time. */
  async function timeline(agentId: string, query: TimelineQuery) {
    if (!AGENTS.has(agentId)) return null;
    const { t, minute } = today();
    const since = Date.parse(isoAt(minute)) - Math.max(0, t - Date.parse(query.since));
    return dayTimeline(agentId, minute, seed).filter((e) => Date.parse(e.at) >= since).slice(0, Math.max(0, query.limit));
  }

  const demo: DemoControls = {
    clock: () => clockView(clock, now()),
    setSpeed: (raw) => {
      const speed = parseSpeed(raw);
      if (speed === null) return { ok: false, status: 400, error: 'speed must be 1, 10 or 60' };
      clock = withSpeed(clock, speed, now());
      schedule();
      notify();
      return { ok: true, value: clockView(clock, now()) };
    },
  };

  return {
    id,
    kind: 'demo',
    label: 'Demo',
    capabilities: { chat: true, createTask: true, approvals: false, pause: false, stop: true, runJob: true, reassign: true },
    snapshot,
    readMessages,
    timeline,
    chat,
    createTask,
    stop,
    runJob,
    reassign,
    usage: async (agent, window) => demoUsage(agent, window, today().minute),
    subscribe: (listener) => {
      listeners = new Set([...listeners, listener]);
      schedule();
      return () => {
        listeners = new Set([...listeners].filter((l) => l !== listener));
        schedule();
      };
    },
    close: async () => {
      listeners = new Set();
      schedule();
    },
    demo,
  };
}
