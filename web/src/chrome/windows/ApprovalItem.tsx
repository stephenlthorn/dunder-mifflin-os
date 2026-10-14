// One request in HR · Approvals: who asks, the kind, the risk, since when, what (title) and why (detail), then an
// optional note and Approve / Reject. Live, the decision is POSTed (the server audits it before acting); in demo
// mode it is a local echo. The buttons stay visible but off, with the reason, when you can't decide here.
import { useId, useState } from 'react';
import type { Approval } from '@shared/contract';
import { type Decision, decideApproval } from '../../data/approvalsApi';
import { sinceText } from '../../office/status';

type Props = {
  approval: Approval;
  blocker: string | null; // why you can't decide it here (read-only, shown only, adapter can't)
  demo: boolean;
  now: number;
  onDecided: (approval: Approval, decision: Decision) => void;
  onOpenPerson: (id: string) => void;
};

const KIND: Record<Approval['kind'], string> = { permission: 'asks permission', question: 'has a question', task: 'needs you to do something' };
const NOTE_MAX = 500;

export function ApprovalItem({ approval: a, blocker, demo, now, onDecided, onOpenPerson }: Props) {
  const id = useId();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: Decision) {
    setBusy(decision);
    setError(null);
    const result = demo ? { ok: true as const } : await decideApproval(a.id, decision, note);
    setBusy(null);
    if (result.ok) onDecided(a, decision);
    else setError(result.error);
  }

  const off = blocker !== null || busy !== null;
  return (
    <li className={`approval risk-${a.risk}`} data-approval={a.id} aria-labelledby={`${id}-title`}>
      <header className="approval-head">
        {a.personId
          ? <button type="button" className="link-btn approval-from" onClick={() => onOpenPerson(a.personId!)}>{a.from}</button>
          : <span className="approval-from">{a.from}</span>}
        <span className="approval-kind">{KIND[a.kind]}</span>
        <span className={`risk-badge risk-${a.risk}`}>{a.risk} risk</span>
        <time dateTime={a.requestedAt} title={a.requestedAt}>{sinceText(a.requestedAt, now) ?? ''}</time>
      </header>
      <h3 id={`${id}-title`} className="approval-title">{a.title}</h3>
      {a.detail && <p className="approval-detail">{a.detail}</p>}
      {!a.decidable ? <p className="approval-hint">{blocker}</p> : (
        <div className="approval-form">
          <label htmlFor={`${id}-note`}>Note <span className="muted">(optional; sent with your decision)</span></label>
          <textarea id={`${id}-note`} rows={2} maxLength={NOTE_MAX} value={note} disabled={off} onChange={(e) => setNote(e.target.value)} />
          <div className="approval-actions">
            <button type="button" className="approve" disabled={off} aria-describedby={`${id}-effects`} onClick={() => void decide('approve')}>
              {busy === 'approve' ? 'Approving…' : 'Approve'}
            </button>
            <button type="button" className="reject" disabled={off} aria-describedby={`${id}-effects`} onClick={() => void decide('reject')}>
              {busy === 'reject' ? 'Rejecting…' : 'Reject'}
            </button>
          </div>
          <p id={`${id}-effects`} className="approval-hint">
            {blocker ?? (a.actions ? `Approve: ${a.actions.approve}. Reject: ${a.actions.reject}.` : 'Your decision goes back to the agent.')}
          </p>
          {error && <p className="approval-error" role="alert">{error}</p>}
        </div>
      )}
    </li>
  );
}
