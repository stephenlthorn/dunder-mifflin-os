// POST /api/approvals/:id: approve or reject something an agent waits on you for. The server checks writes, the
// adapter's approvals flag and sign-in, and writes the audit log before it acts; this only reports what it said.
export type Decision = 'approve' | 'reject';
export type DecisionResult = { ok: true } | { ok: false; error: string };

export function interpretDecision(status: number, body: unknown): DecisionResult {
  if (status >= 200 && status < 300) return { ok: true };
  if (status === 401) return { ok: false, error: 'Sign in again to decide (your session ended).' };
  const error = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
    ? (body as { error: string }).error : `Request failed (${status})`;
  return { ok: false, error };
}

export async function decideApproval(id: string, decision: Decision, note: string): Promise<DecisionResult> {
  const trimmed = note.trim();
  try {
    const res = await fetch(`/api/approvals/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(trimmed ? { decision, note: trimmed } : { decision }),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return interpretDecision(res.status, body);
  } catch (err) {
    return { ok: false, error: `Could not reach the server (${String(err)})` };
  }
}
