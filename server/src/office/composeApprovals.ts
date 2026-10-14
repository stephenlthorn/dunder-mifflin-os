// Adapter approvals -> the snapshot's approvals inbox. A working or idle bot with something pending is shown as
// needs-input (the one "needs you" signal the whole UI reads). Pure: no I/O.
// Only adapters that declare the approvals capability are listed. Ids become '<adapter id>:<adapter's id>'; agent ids
// become the person at that agent's desk (or stay the agent id for an agent without a desk). Text is scrubbed again.
import type { Approval, ApprovalRisk, Person, Presence } from '../../../shared/contract.ts';
import type { ApprovalRequest } from '../adapters/types.ts';
import { scrubText } from '../domain/scrub.ts';
import type { AdapterReading } from './compose.ts';
import type { Seating } from './seating.ts';

export const MAX_APPROVALS = 50;
/** An adapter's own approval id: safe in a URL path segment after the adapter id and a colon. */
export const LOCAL_APPROVAL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const KINDS: ReadonlySet<string> = new Set(['permission', 'question', 'task']);
const RISKS: ReadonlySet<string> = new Set(['low', 'medium', 'high']);
const LIMITS = Object.freeze({ title: 200, detail: 600, action: 60, from: 80 });

const clip = (text: string, max: number): string => {
  const clean = scrubText(text.replace(/\s+/g, ' ').trim());
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

const isIso = (s: string): boolean => /^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s));

function valid(r: ApprovalRequest): boolean {
  return LOCAL_APPROVAL_ID.test(r.id) && KINDS.has(r.kind) && isIso(r.requestedAt) && typeof r.title === 'string' && r.title.trim().length > 0;
}

function toApproval(r: ApprovalRequest, adapterId: string, seating: Seating, people: ReadonlyMap<string, Person>): Approval {
  const personId = seating.personOf(adapterId, r.agentId);
  const person = personId ? people.get(personId) : undefined;
  const risk: ApprovalRisk = r.risk && RISKS.has(r.risk) ? r.risk : 'medium';
  return {
    id: `${adapterId}:${r.id}`, adapter: adapterId, ...(person ? { personId: person.id } : {}),
    from: person ? person.name : clip(r.agentId, LIMITS.from), kind: r.kind, title: clip(r.title, LIMITS.title),
    ...(r.detail?.trim() ? { detail: clip(r.detail, LIMITS.detail) } : {}),
    requestedAt: new Date(Date.parse(r.requestedAt)).toISOString(), risk, decidable: r.decidable !== false,
    ...(r.actions ? { actions: { approve: clip(r.actions.approve, LIMITS.action), reject: clip(r.actions.reject, LIMITS.action) } } : {}),
  };
}

export function composeApprovals(readings: ReadonlyArray<AdapterReading>, seating: Seating, people: ReadonlyArray<Person>): Approval[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  return readings
    .filter((reading) => reading.adapter.capabilities.approvals)
    .flatMap((reading) => (reading.snapshot.approvals ?? []).filter(valid).map((r) => toApproval(r, reading.adapter.id, seating, byId)))
    .sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : a.requestedAt > b.requestedAt ? -1 : 0))
    .slice(0, MAX_APPROVALS);
}

const WAITABLE: ReadonlySet<Presence['status']> = new Set(['working', 'idle']); // meeting, error and offline say more

/** A working or idle person with a pending approval needs you: status needs-input, the newest item as activity. */
export function surfaceApprovals(presence: Readonly<Record<string, Presence>>, approvals: ReadonlyArray<Approval>): Record<string, Presence> {
  const byPerson = new Map<string, Approval[]>();
  for (const a of approvals) if (a.personId) byPerson.set(a.personId, [...(byPerson.get(a.personId) ?? []), a]);
  return Object.fromEntries(Object.entries(presence).map(([id, p]): [string, Presence] => {
    const items = byPerson.get(id); // newest first
    if (!items || !WAITABLE.has(p.status)) return [id, p];
    const { roomId: _away, ...rest } = p;
    return [id, { ...rest, status: 'needs-input', activity: items[0]!.title, since: items[items.length - 1]!.requestedAt }];
  }));
}
