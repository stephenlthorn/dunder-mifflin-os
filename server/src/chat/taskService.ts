// POST /api/tasks: create a shared kanban card from the Ops room (`hermes kanban create … --assignee`).
// The assignee is a profile key: the office has already turned a person id into their bot's profile.
import type { AgentTask } from '../adapters/types.ts';
import { isRecord, str } from '../hermes/guards.ts';
import { isBotProfile } from '../roster.ts';
import { validateTaskTitle } from '../validate.ts';
import { log, redact } from '../log.ts';
import { mapKanbanStatus } from '../domain/tasks.ts';
import { buildKanbanCreateArgs } from './commands.ts';
import type { Runner } from './runner.ts';
import type { ServiceError } from './chatService.ts';

export const TASK_ROOMS: ReadonlySet<string> = new Set(['ops']);
export type TaskInput = { roomId: unknown; title: unknown; assignee: unknown };
export type TaskResult = { ok: true; task: AgentTask } | ServiceError;

function parseCreated(stdout: string): { id: string; status: string; createdAt: number | null } | null {
  const start = stdout.indexOf('{');
  try {
    const json: unknown = start >= 0 ? JSON.parse(stdout.slice(start)) : null;
    const id = isRecord(json) ? str(json.id, 64) : null;
    if (!isRecord(json) || !id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
    return { id, status: str(json.status, 20) ?? 'todo', createdAt: typeof json.created_at === 'number' ? json.created_at : null };
  } catch {
    return null;
  }
}

export function createTaskService(opts: { runner: Runner; hermesBin: string; timeoutMs: number; now?: () => number }) {
  const now = opts.now ?? Date.now;

  async function create(input: TaskInput): Promise<TaskResult> {
    if (typeof input.roomId !== 'string' || !TASK_ROOMS.has(input.roomId)) return { ok: false, status: 400, error: 'Shared tasks can only be created from the Ops room' };
    const profile = isBotProfile(input.assignee) ? input.assignee : null;
    if (!profile) return { ok: false, status: 400, error: 'assignee must be a person with a bot (or a bot profile key)' };
    const title = validateTaskTitle(input.title);
    if (!title.ok) return { ok: false, status: 400, error: title.error };
    const roomId = input.roomId;
    try {
      const res = await opts.runner(opts.hermesBin, buildKanbanCreateArgs(title.value, profile, roomId), { timeoutMs: opts.timeoutMs });
      const created = res.code === 0 ? parseCreated(res.stdout) : null;
      log('task.create', { roomId, profile, code: res.code, ok: created !== null });
      if (res.timedOut) return { ok: false, status: 504, error: 'hermes kanban did not answer in time' };
      if (!created) return { ok: false, status: 502, error: 'hermes kanban create failed' };
      const at = created.createdAt !== null ? created.createdAt * 1000 : now();
      return {
        ok: true,
        task: {
          id: created.id, title: title.value, status: mapKanbanStatus(created.status) ?? 'todo',
          ownerAgentId: profile, roomId, shared: true, updatedAt: new Date(at).toISOString(),
        },
      };
    } catch (error) {
      log('task.error', { roomId, profile, detail: redact(error instanceof Error ? error.message : String(error)) });
      return { ok: false, status: 502, error: 'Could not start the hermes CLI' };
    }
  }

  return { create };
}
