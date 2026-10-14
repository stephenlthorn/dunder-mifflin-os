// The approvals inbox, office side: list what agents wait on you for, and decide one. A decision needs the server to
// allow writes AND the adapter's approvals flag (sign-in is the HTTP layer's job), a valid body, an item that is still
// pending and decidable, and an audit entry written BEFORE the adapter acts: no audit log, no decision (fail closed).
import type { Approval } from '../../../shared/contract.ts';
import type { AgentAdapter } from '../adapters/types.ts';
import type { AuditLog } from '../audit/auditLog.ts';
import { LOCAL_APPROVAL_ID } from './composeApprovals.ts';
import { parseDecision } from './decision.ts';
import type { Office } from './office.ts';
import { refuseWrite } from './writes.ts';

export type ActionOutcome = { ok: true } | { ok: false; status: number; error: string };
export type Actor = 'local' | 'signed-in'; // signed in with DMOS_ACCESS_TOKEN, or an open local server

const GLOBAL_ID = /^([a-z][a-z0-9-]{0,11}):(.+)$/;
export const AUDIT_UNAVAILABLE = 'Could not write the audit log (~/.dunder-mifflin-os/audit.log or DMOS_AUDIT_LOG), so nothing was done';

type Options = {
  readonly adapters: ReadonlyArray<AgentAdapter>;
  readonly allowWrites: boolean;
  readonly read: () => Promise<Office>;
  readonly fresh: () => Promise<Office>;
  readonly audit: AuditLog | null;
};

export function createApprovalActions(opts: Options) {
  const byId = new Map(opts.adapters.map((a) => [a.id, a]));

  /** Everything agents are waiting on you for, newest first. Reading is allowed on a read-only server. */
  async function approvals(): Promise<Approval[]> {
    return [...((await opts.read()).snapshot.approvals ?? [])];
  }

  async function resolveApproval(globalId: string, body: unknown, actor: Actor): Promise<ActionOutcome> {
    const m = GLOBAL_ID.exec(globalId);
    const adapter = m ? byId.get(m[1]!) : undefined;
    const localId = m?.[2] ?? '';
    if (!adapter || !LOCAL_APPROVAL_ID.test(localId)) return { ok: false, status: 404, error: 'Unknown approval' };
    const refused = refuseWrite(opts.allowWrites, adapter, 'approvals');
    if (refused || !adapter.resolveApproval) return refused ?? { ok: false, status: 501, error: 'No approvals' };
    const parsed = parseDecision(body);
    if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
    const office = await opts.fresh();
    const item = office.snapshot.approvals?.find((a) => a.id === globalId);
    if (!item) return { ok: false, status: 409, error: 'That is no longer waiting on you' };
    if (!item.decidable) return { ok: false, status: 409, error: 'Answer this one where the agent runs; the office only shows it' };
    const decision = parsed.value.approve ? 'approve' : 'reject';
    const seat = item.personId ? (office.seating.staff.get(item.personId) ?? office.seating.temps.find((t) => t.personId === item.personId)) : undefined;
    const intent = {
      event: 'approval.decide', approval: item.id, adapter: adapter.id, agent: seat?.agentId ?? item.from, person: item.personId,
      kind: item.kind, risk: item.risk, title: item.title, decision, note: parsed.value.note, actor,
    };
    if (!opts.audit || !opts.audit.append(intent)) return { ok: false, status: 503, error: AUDIT_UNAVAILABLE };
    const result = await adapter.resolveApproval(localId, parsed.value);
    opts.audit.append(result.ok
      ? { event: 'approval.decided', approval: item.id, decision }
      : { event: 'approval.failed', approval: item.id, decision, status: result.status, error: result.error });
    return result.ok ? { ok: true } : { ok: false, status: result.status, error: result.error };
  }

  return { approvals, resolveApproval };
}
