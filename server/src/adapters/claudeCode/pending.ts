// What Claude Code sessions are waiting on you for. A held item is a PermissionRequest hook kept open until you decide
// (answered with allow/deny), the hold runs out, Claude Code hangs up, the session moves on or the server closes
// (all answered "no decision", so Claude Code asks in the terminal as usual). A shown item can't be answered here.
// Immutable: every change replaces the map. In memory only; never logged.
import { randomBytes } from 'node:crypto';
import type { ActionResult, ApprovalDecision, ApprovalRequest, InboundResponse } from '../types.ts';

export const NO_DECISION: InboundResponse = Object.freeze({ status: 204 });
export const DECISION_ACTIONS = Object.freeze({ approve: 'Allow it once', reject: 'Deny it (your note goes to Claude)' });
const MAX_ITEMS = 50;
const REJECTED = 'Rejected in Dunder Mifflin OS';

type Item = {
  readonly request: ApprovalRequest;
  readonly sessionId: string;
  readonly settle?: (out: InboundResponse) => void; // held items only
};

export type Asked = Omit<ApprovalRequest, 'id' | 'requestedAt' | 'decidable' | 'actions'>;

export function decisionBody(d: ApprovalDecision): InboundResponse {
  const decision = d.approve ? { behavior: 'allow' } : { behavior: 'deny', message: d.note ? `${REJECTED}: ${d.note}` : REJECTED };
  return { status: 200, body: { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } } };
}

export function createPending(opts: { now: () => number; holdMs: number; onChange: () => void }) {
  let items: ReadonlyMap<string, Item> = new Map();

  const newId = (): string => `p${randomBytes(9).toString('base64url')}`;

  function remove(id: string, answer: InboundResponse = NO_DECISION): Item | undefined {
    const item = items.get(id);
    if (!item) return undefined;
    items = new Map([...items].filter(([k]) => k !== id));
    item.settle?.(answer);
    opts.onChange();
    return item;
  }

  function add(sessionId: string, asked: Asked, settle?: (out: InboundResponse) => void): string | null {
    if (items.size >= MAX_ITEMS) return null;
    const id = newId();
    const request: ApprovalRequest = {
      ...asked, id, requestedAt: new Date(opts.now()).toISOString(), decidable: Boolean(settle), ...(settle ? { actions: DECISION_ACTIONS } : {}),
    };
    items = new Map([...items, [id, settle ? { request, sessionId, settle } : { request, sessionId }]]);
    opts.onChange();
    return id;
  }

  /** Everything the session asked for so far is answered without a decision and dropped. */
  function clearSession(sessionId: string): void {
    for (const [id, item] of items) if (item.sessionId === sessionId) remove(id);
  }

  /** Keep the hook open until a decision; resolves with the hook's answer. */
  function hold(sessionId: string, asked: Asked, signal?: AbortSignal): Promise<InboundResponse> {
    clearSession(sessionId); // a session asks one thing at a time; an older prompt is stale
    return new Promise((resolve) => {
      let timer: NodeJS.Timeout | undefined;
      const settle = (out: InboundResponse) => {
        if (timer) clearTimeout(timer);
        resolve(out);
      };
      const id = add(sessionId, asked, settle);
      if (!id) return resolve(NO_DECISION);
      timer = setTimeout(() => remove(id), opts.holdMs);
      signal?.addEventListener('abort', () => remove(id), { once: true });
    });
  }

  /** Shown only: answer it in Claude Code. Skipped when the session already has something waiting here. */
  function show(sessionId: string, asked: Asked): void {
    if ([...items.values()].some((i) => i.sessionId === sessionId)) return;
    add(sessionId, asked);
  }

  function decide(id: string, decision: ApprovalDecision): ActionResult<ApprovalRequest> {
    const item = items.get(id);
    if (!item) return { ok: false, status: 404, error: 'No such permission request (answered or expired)' };
    if (!item.settle) return { ok: false, status: 409, error: 'Answer this one in Claude Code' };
    remove(id, decisionBody(decision));
    return { ok: true, value: item.request };
  }

  const list = (): ReadonlyArray<ApprovalRequest> => [...items.values()].map((i) => i.request);
  const hasHeld = (sessionId: string): boolean => [...items.values()].some((i) => i.sessionId === sessionId && i.settle);
  const close = (): void => { for (const id of [...items.keys()]) remove(id); };

  return { hold, show, clearSession, decide, list, hasHeld, close };
}
