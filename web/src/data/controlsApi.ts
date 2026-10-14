// POST /api/people/:id/actions (a control verb) and GET /api/budgets (Corporate). The server checks writes, sign-in,
// the adapter's flags and the arguments, and audits before it acts; this only reports what it said.
import type { BudgetsReport, ControlRequest } from '@shared/controls';
import { SignInRequiredError } from './api';
import { parseBudgetsReport, parseControlReply } from './budgetGuards';

export type ControlOutcome = { ok: true; message: string } | { ok: false; error: string };

export function interpretControl(status: number, body: unknown): ControlOutcome {
  if (status >= 200 && status < 300) {
    const reply = parseControlReply(body);
    return reply ? { ok: true, message: reply.message } : { ok: false, error: 'The server returned an unexpected answer' };
  }
  if (status === 401) return { ok: false, error: 'Sign in again to do this (your session ended).' };
  const error = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
    ? (body as { error: string }).error : `Request failed (${status})`;
  return { ok: false, error };
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function postControl(personId: string, request: ControlRequest): Promise<ControlOutcome> {
  try {
    const res = await fetch(`/api/people/${encodeURIComponent(personId)}/actions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
    });
    return interpretControl(res.status, await readJson(res));
  } catch (err) {
    return { ok: false, error: `Could not reach the server (${String(err)})` };
  }
}

/** null: this server keeps no budgets (an older server answers 404). */
export async function fetchBudgets(signal?: AbortSignal): Promise<BudgetsReport | null> {
  const res = await fetch('/api/budgets', { signal, headers: { accept: 'application/json' } });
  if (res.status === 401) throw new SignInRequiredError();
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /api/budgets ${res.status}`);
  const report = parseBudgetsReport(await readJson(res));
  if (!report) throw new Error('GET /api/budgets returned an invalid report');
  return report;
}
