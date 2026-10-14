// Delivering a decision (or a control verb) to a webhook agent: POST JSON to the callback URL it gave (https, or http
// on loopback; checked in schema.ts), no redirects, a short timeout. Signed so the agent can tell it came from this office:
//   X-DMOS-Timestamp: <unix seconds>
//   X-DMOS-Signature: sha256=<hex HMAC-SHA256(DMOS_INGEST_TOKEN, "<timestamp>.<body>")>
// The token itself is never sent. Logs the agent and the outcome, never the URL or the note.
import { createHmac, randomUUID } from 'node:crypto';
import type { ActionResult, ApprovalDecision } from '../types.ts';
import { log } from '../../log.ts';

export type CallbackInit = { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal; redirect: 'error' };
export type CallbackPost = (url: string, init: CallbackInit) => Promise<{ ok: boolean; status: number }>;

export const DEFAULT_CALLBACK_TIMEOUT_MS = 5000;

export function signDecision(token: string, timestamp: string, body: string): string {
  return `sha256=${createHmac('sha256', token).update(`${timestamp}.${body}`).digest('hex')}`;
}

export type DecisionTarget = { readonly callback: string; readonly agentId: string; readonly requestId: string };
export type SignedPostOptions = { post: CallbackPost; token: string; now: () => number; timeoutMs: number };

/** POST one signed JSON body to an agent's callback: no redirects, a timeout, 2xx = taken. `what` names the log event. */
async function postSigned(opts: SignedPostOptions, url: string, agentId: string, body: string, what: string): Promise<ActionResult<null>> {
  const timestamp = String(Math.floor(opts.now() / 1000));
  const headers = { 'Content-Type': 'application/json', 'X-DMOS-Timestamp': timestamp, 'X-DMOS-Signature': signDecision(opts.token, timestamp, body) };
  const ctrl = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => { ctrl.abort(); resolve('timeout'); }, opts.timeoutMs); });
  try {
    const res = await Promise.race([opts.post(url, { method: 'POST', headers, body, signal: ctrl.signal, redirect: 'error' }), timeout]);
    if (res === 'timeout') return (log(what, { agent: agentId, outcome: 'timeout' }), { ok: false, status: 504, error: "The agent's callback did not answer in time" });
    log(what, { agent: agentId, status: res.status });
    return res.ok ? { ok: true, value: null } : { ok: false, status: 502, error: `The agent's callback answered ${res.status}` };
  } catch {
    log(what, { agent: agentId, outcome: 'unreachable' });
    return { ok: false, status: 502, error: "Could not reach the agent's callback" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function sendDecision(opts: SignedPostOptions, target: DecisionTarget, d: ApprovalDecision): Promise<ActionResult<null>> {
  const body = JSON.stringify({
    type: 'approval-decision', id: target.requestId, agent: target.agentId, decision: d.approve ? 'approve' : 'reject',
    ...(d.note ? { note: d.note } : {}), decidedAt: new Date(opts.now()).toISOString(),
  });
  return postSigned(opts, target.callback, target.agentId, body, 'approval.callback');
}

export type ControlEventAction = 'pause' | 'resume' | 'stop';

/** A control verb for a webhook agent: `{ type: 'control', id, agent, action, requestedAt }`, signed like a decision. */
export async function sendControl(opts: SignedPostOptions, target: { readonly callback: string; readonly agentId: string }, action: ControlEventAction): Promise<ActionResult<null>> {
  const body = JSON.stringify({ type: 'control', id: randomUUID(), agent: target.agentId, action, requestedAt: new Date(opts.now()).toISOString() });
  return postSigned(opts, target.callback, target.agentId, body, 'control.callback');
}

/** The default sender: global fetch. */
export const fetchPost: CallbackPost = async (url, init) => {
  const res = await fetch(url, init);
  return { ok: res.ok, status: res.status };
};
