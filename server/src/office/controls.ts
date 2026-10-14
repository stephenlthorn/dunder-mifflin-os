// Control verbs, office side (POST /api/people/:id/actions and the budget monitor's auto-pause): pause / resume a bot,
// stop its run, run one of its jobs now, hand one of its cards to another bot. Each needs the server to allow writes
// AND the adapter's capability flag AND the agent not to have turned it off (sign-in is the HTTP layer's job). The
// arguments are checked against a FRESH snapshot (the job is this desk's and switched on, the card is this desk's and
// open, the new owner is another bot of the same adapter), and an audit entry is written BEFORE the adapter acts:
// no audit log, no action (fail closed). The outcome is audited too.
import type { AgentCapabilities, Person } from '../../../shared/contract.ts';
import { ACTION_FLAG, type ControlAction, type ControlReply, type ControlRequest } from '../../../shared/controls.ts';
import type { AgentAdapter, ControlResult } from '../adapters/types.ts';
import type { AuditLog, AuditValue } from '../audit/auditLog.ts';
import { scrubText } from '../domain/scrub.ts';
import { AUDIT_UNAVAILABLE, type Actor } from './approvalActions.ts';
import { parseControlRequest } from './controlRequest.ts';
import type { Office } from './office.ts';
import type { Seat } from './seating.ts';
import { refuseWrite } from './writes.ts';

export type ControlActor = Actor | 'corporate'; // 'corporate': the budget monitor's auto-pause
export type ControlOutcome = { ok: true; value: ControlReply } | { ok: false; status: number; error: string };

type Refusal = { ok: false; status: number; error: string };
type Plan = { ok: true; details: Readonly<Record<string, AuditValue>>; message: string; run: () => Promise<ControlResult> };
type Ctx = { readonly office: Office; readonly seat: Seat; readonly adapter: AgentAdapter; readonly person: Person };

const AGENT_TURNED_OFF: Readonly<Record<keyof AgentCapabilities, string>> = {
  chat: 'This agent takes no messages', createTask: 'This agent takes no tasks', approvals: 'This agent has no approvals',
  pause: 'This agent gave the office no way to pause it', stop: 'This agent gave the office no way to stop it',
  runJob: 'This agent has no jobs the office can run', reassign: 'This agent\'s cards can\'t be handed over',
};

const refuse = (status: number, error: string): Refusal => ({ ok: false, status, error });
const missing = (adapter: AgentAdapter, action: ControlAction): Refusal => refuse(501, `${adapter.label} agents can't ${action}`);

function seatOf(office: Office, personId: string): Seat | undefined {
  return office.seating.staff.get(personId) ?? office.seating.temps.find((t) => t.personId === personId);
}

function planStop(req: Extract<ControlRequest, { action: 'stop' }>, { office, seat, adapter, person }: Ctx): Plan | Refusal {
  const stop = adapter.stop;
  if (!stop) return missing(adapter, 'stop');
  const taskId = req.args?.taskId;
  if (!taskId) return { ok: true, details: {}, message: `Stopped ${person.name}'s current run.`, run: () => stop(seat.agentId, {}) };
  const task = office.snapshot.tasks.find((t) => t.id === taskId && t.ownerId === person.id);
  if (!task) return refuse(404, 'No such card on this desk');
  if (task.status !== 'doing') return refuse(409, 'That card is not running');
  return { ok: true, details: { task: task.id, taskTitle: task.title }, message: `Stopped ${task.title}.`, run: () => stop(seat.agentId, { taskId }) };
}

function planRunJob(jobId: string, { office, seat, adapter, person }: Ctx): Plan | Refusal {
  const runJob = adapter.runJob;
  if (!runJob) return missing(adapter, 'run-job');
  const job = office.snapshot.jobs?.[person.id]?.find((j) => j.id === jobId);
  if (!job) return refuse(404, 'No such job at this desk');
  if (!job.enabled) return refuse(409, 'That job is paused where it runs; resume it there first');
  return { ok: true, details: { job: jobId, jobName: job.name }, message: `${job.name}: running now.`, run: () => runJob(seat.agentId, jobId) };
}

function planReassign(args: { taskId: string; to: string }, { office, seat, adapter, person }: Ctx): Plan | Refusal {
  const reassign = adapter.reassign;
  if (!reassign) return missing(adapter, 'reassign');
  const task = office.snapshot.tasks.find((t) => t.id === args.taskId && t.ownerId === person.id);
  if (!task) return refuse(404, 'No such card on this desk');
  if (task.status === 'done') return refuse(409, 'That card is done');
  if (args.to === person.id) return refuse(400, 'Pick someone else');
  const target = seatOf(office, args.to);
  const toPerson = office.snapshot.people.find((p) => p.id === args.to);
  if (!target || !toPerson || target.adapterId !== seat.adapterId) return refuse(400, `Hand it to another ${adapter.label} agent`);
  return {
    ok: true, details: { task: task.id, taskTitle: task.title, to: args.to, toAgent: target.agentId },
    message: `${task.title}: now with ${toPerson.name}.`, run: () => reassign(seat.agentId, task.id, target.agentId),
  };
}

function plan(req: ControlRequest, ctx: Ctx): Plan | Refusal {
  const { adapter, seat, person } = ctx;
  switch (req.action) {
    case 'pause':
      return adapter.pause ? { ok: true, details: {}, message: `Paused ${person.name}.`, run: () => adapter.pause!(seat.agentId) } : missing(adapter, 'pause');
    case 'resume':
      return adapter.resume ? { ok: true, details: {}, message: `Resumed ${person.name}.`, run: () => adapter.resume!(seat.agentId) } : missing(adapter, 'resume');
    case 'stop':
      return planStop(req, ctx);
    case 'run-job':
      return planRunJob(req.args.jobId, ctx);
    case 'reassign':
      return planReassign(req.args, ctx);
  }
}

export function createControls(opts: {
  readonly adapters: ReadonlyArray<AgentAdapter>; readonly allowWrites: boolean; readonly fresh: () => Promise<Office>; readonly audit: AuditLog | null;
}) {
  const byId = new Map(opts.adapters.map((a) => [a.id, a]));

  /** Do one verb to the bot at `personId`'s desk. `reason` is audited (the budget monitor says why it paused). */
  async function act(personId: string, body: unknown, actor: ControlActor, reason?: string): Promise<ControlOutcome> {
    const parsed = parseControlRequest(body);
    if (!parsed.ok) return refuse(400, parsed.error);
    const req = parsed.value;
    const office = await opts.fresh();
    const seat = seatOf(office, personId);
    const adapter = seat ? byId.get(seat.adapterId) : undefined;
    const person = office.snapshot.people.find((p) => p.id === personId);
    if (!seat || !adapter || !person?.bot) return refuse(404, 'No agent at that desk');
    const flag = ACTION_FLAG[req.action];
    const refused = refuseWrite(opts.allowWrites, adapter, flag);
    if (refused) return refused;
    if (person.bot.capabilities?.[flag] === false) return refuse(501, AGENT_TURNED_OFF[flag]);
    const planned = plan(req, { office, seat, adapter, person });
    if (!planned.ok) return planned;
    const intent = { event: 'control.request', action: req.action, person: personId, adapter: adapter.id, agent: seat.agentId, ...planned.details, actor, reason };
    if (!opts.audit || !opts.audit.append(intent)) return refuse(503, AUDIT_UNAVAILABLE);
    const result = await planned.run();
    opts.audit.append(result.ok
      ? { event: 'control.done', action: req.action, person: personId }
      : { event: 'control.failed', action: req.action, person: personId, status: result.status, error: result.error });
    if (!result.ok) return refuse(result.status, result.error);
    const note = result.value?.note;
    return { ok: true, value: { ok: true, action: req.action, message: note ? scrubText(note).slice(0, 300) : planned.message } };
  }

  return { act };
}
