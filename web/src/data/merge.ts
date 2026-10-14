import type { Approval, OfficeSnapshot, Presence, Task } from '@shared/contract';

/**
 * One SSE update from /api/events. The server's first event carries full presence + tasks (+ approvals); later events
 * merge `presence` by person id and REPLACE `tasks` and `approvals` whenever the field is present.
 */
export type OfficeEvent = { presence?: Record<string, Presence>; tasks?: Task[]; approvals?: Approval[] };

export function applyEvent(snapshot: OfficeSnapshot, event: OfficeEvent): OfficeSnapshot {
  const hasPresence = event.presence !== undefined && Object.keys(event.presence).length > 0;
  const hasTasks = event.tasks !== undefined;
  const hasApprovals = event.approvals !== undefined;
  if (!hasPresence && !hasTasks && !hasApprovals) return snapshot;
  return {
    ...snapshot,
    presence: hasPresence ? { ...snapshot.presence, ...event.presence } : snapshot.presence,
    tasks: hasTasks ? [...event.tasks!] : snapshot.tasks,
    ...(hasApprovals ? { approvals: [...event.approvals!] } : {}),
  };
}
