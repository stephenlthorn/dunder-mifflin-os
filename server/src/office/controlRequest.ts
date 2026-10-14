// The body of POST /api/people/:id/actions -> a ControlRequest. Validated here, at the boundary: known verbs only,
// exact argument shapes, no unknown fields. Ids never start with a dash (they end up in argv).
import { CONTROL_ACTIONS, type ControlAction, type ControlRequest } from '../../../shared/controls.ts';
import { isRecord } from '../hermes/guards.ts';

export type ParsedControl = { ok: true; value: ControlRequest } | { ok: false; error: string };

const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/; // kanban ids, '<adapter>:<agent>:<card>' for push adapters
const JOB_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const PERSON_ID = /^[a-z0-9][a-z0-9-]{0,80}$/;
const ARGS: Readonly<Record<ControlAction, ReadonlyArray<string>>> = {
  pause: [], resume: [], stop: ['taskId'], 'run-job': ['jobId'], reassign: ['taskId', 'to'],
};
const SHAPES: Readonly<Record<string, readonly [RegExp, string]>> = {
  taskId: [TASK_ID, 'a card id (letters, digits, dots, colons, dashes or underscores)'],
  jobId: [JOB_ID, 'a job id (letters, digits, dashes or underscores)'],
  to: [PERSON_ID, 'a person id like jim'],
};

class Invalid extends Error {}

function field(args: Readonly<Record<string, unknown>>, key: string, action: ControlAction, required: boolean): string | undefined {
  const value = args[key];
  if (value === undefined) {
    if (required) throw new Invalid(`${action} needs args.${key}`);
    return undefined;
  }
  const [shape, hint] = SHAPES[key]!;
  if (typeof value !== 'string' || !shape.test(value)) throw new Invalid(`args.${key} must be ${hint}`);
  return value;
}

function build(action: ControlAction, args: Readonly<Record<string, unknown>>): ControlRequest {
  const extra = Object.keys(args).find((k) => !ARGS[action].includes(k));
  if (extra && ARGS[action].length === 0) throw new Invalid(`${action} takes no args`);
  if (extra) throw new Invalid(`unknown field "args.${extra.slice(0, 40)}"`);
  switch (action) {
    case 'pause':
    case 'resume':
      return { action };
    case 'stop': {
      const taskId = field(args, 'taskId', action, false);
      return taskId ? { action, args: { taskId } } : { action };
    }
    case 'run-job':
      return { action, args: { jobId: field(args, 'jobId', action, true)! } };
    case 'reassign':
      return { action, args: { taskId: field(args, 'taskId', action, true)!, to: field(args, 'to', action, true)! } };
  }
}

export function parseControlRequest(body: unknown): ParsedControl {
  const action = isRecord(body) ? body.action : undefined;
  if (!isRecord(body) || typeof action !== 'string' || !(CONTROL_ACTIONS as ReadonlyArray<string>).includes(action)) {
    return { ok: false, error: `action must be one of ${CONTROL_ACTIONS.join(', ')}` };
  }
  const extra = Object.keys(body).find((k) => k !== 'action' && k !== 'args');
  if (extra) return { ok: false, error: `unknown field "${extra.slice(0, 40)}"` };
  if (body.args !== undefined && !isRecord(body.args)) return { ok: false, error: 'args must be an object' };
  try {
    return { ok: true, value: build(action as ControlAction, isRecord(body.args) ? body.args : {}) };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message };
    throw error;
  }
}
