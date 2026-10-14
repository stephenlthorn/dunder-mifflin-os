// SSE payloads. Clients MERGE `presence` (by person id) and REPLACE `tasks` and `approvals` when present.
import type { Approval, OfficeSnapshot, Presence, Task } from '../../../shared/contract.ts';

export type OfficeUpdate = { presence?: Record<string, Presence>; tasks?: Task[]; approvals?: Approval[] };

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function diffSnapshots(prev: OfficeSnapshot, next: OfficeSnapshot): OfficeUpdate | null {
  const changed = Object.entries(next.presence).filter(([id, p]) => !same(prev.presence[id], p));
  const presence = changed.length ? Object.fromEntries(changed) : undefined;
  const tasks = same(prev.tasks, next.tasks) ? undefined : next.tasks;
  const approvals = same(prev.approvals ?? [], next.approvals ?? []) ? undefined : (next.approvals ?? []);
  if (!presence && !tasks && !approvals) return null;
  return { ...(presence ? { presence } : {}), ...(tasks ? { tasks } : {}), ...(approvals ? { approvals } : {}) };
}

export function fullUpdate(snapshot: OfficeSnapshot): OfficeUpdate {
  return { presence: snapshot.presence, tasks: snapshot.tasks, ...(snapshot.approvals ? { approvals: snapshot.approvals } : {}) };
}
