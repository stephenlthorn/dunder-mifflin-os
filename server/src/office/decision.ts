// The body of POST /api/approvals/:id -> an ApprovalDecision. Validated here, at the boundary.
import type { ApprovalDecision } from '../adapters/types.ts';
import { isRecord } from '../hermes/guards.ts';

export const NOTE_MAX = 500;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/; // newlines and tabs are fine in a note

export type ParsedDecision = { ok: true; value: ApprovalDecision } | { ok: false; error: string };

export function parseDecision(body: unknown): ParsedDecision {
  if (!isRecord(body) || (body.decision !== 'approve' && body.decision !== 'reject')) {
    return { ok: false, error: 'decision must be "approve" or "reject"' };
  }
  const approve = body.decision === 'approve';
  if (body.note === undefined || body.note === null) return { ok: true, value: { approve } };
  if (typeof body.note !== 'string') return { ok: false, error: 'note must be text' };
  const note = body.note.trim();
  if (note.length > NOTE_MAX) return { ok: false, error: `note is longer than ${NOTE_MAX} characters` };
  if (CONTROL.test(note)) return { ok: false, error: 'note must be plain text' };
  return { ok: true, value: note ? { approve, note } : { approve } };
}
