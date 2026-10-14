// Every write the office makes through an adapter (chat, new tasks, approvals, control verbs) needs BOTH the
// server to allow writes (DMOS_ALLOW_WRITES=1; read-only is the default) AND the agent's adapter to declare the
// capability. The HTTP layer refuses non-GET routes on a read-only server too; this is the same rule one level down.
import type { AgentCapabilities } from '../../../shared/contract.ts';
import type { AgentAdapter } from '../adapters/types.ts';

export const READ_ONLY_ERROR = 'Read-only mode: chat and task creation are off. Restart the server with DMOS_ALLOW_WRITES=1 (or --allow-writes) to turn them on.';

export type WriteRefusal = { ok: false; status: 403 | 501; error: string };

const CANNOT: Readonly<Record<keyof AgentCapabilities, string>> = {
  chat: "can't receive messages",
  createTask: "can't take new tasks",
  approvals: "don't have approvals",
  pause: "can't be paused",
  stop: "can't be stopped",
  runJob: "can't run jobs from the office",
  reassign: "can't hand cards over",
};

export function refuseWrite(allowWrites: boolean, adapter: AgentAdapter, flag: keyof AgentCapabilities): WriteRefusal | null {
  if (!allowWrites) return { ok: false, status: 403, error: READ_ONLY_ERROR };
  if (!adapter.capabilities[flag]) return { ok: false, status: 501, error: `${adapter.label} agents ${CANNOT[flag]}` };
  return null;
}
