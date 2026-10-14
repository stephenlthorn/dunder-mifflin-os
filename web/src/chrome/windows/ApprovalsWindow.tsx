// HR · Approvals: Toby Flenderson's desk is the inbox of everything agents wait on you for (Toby himself stays
// "No bot yet"). Newest first, from the snapshot, so it stays live over SSE.
import type { Approval, OfficeSnapshot } from '@shared/contract';
import type { BudgetStatus } from '@shared/controls';
import { budgetHeadline } from '../../budgets/budgetModel';
import type { Decision } from '../../data/approvalsApi';
import { decideBlocker } from '../../office/needsYou';
import { ApprovalItem } from './ApprovalItem';

type Props = {
  snapshot: OfficeSnapshot;
  writable: boolean;
  demo: boolean;
  now: number;
  onDecided: (approval: Approval, decision: Decision) => void;
  onOpenPerson: (id: string) => void;
  budgetAlerts?: readonly BudgetStatus[]; // over budget and not paused: Corporate wants to talk to you
};

function CorporateCalls({ alerts, onOpenPerson }: { alerts: readonly BudgetStatus[]; onOpenPerson: (id: string) => void }) {
  return (
    <ul className="corporate-calls" aria-label="Corporate wants to talk to you" data-testid="corporate-calls">
      {alerts.map((b) => (
        <li key={b.personId} className="corporate-call">
          <button type="button" className="link-btn" onClick={() => onOpenPerson(b.personId)}>{b.name}</button>
          <span> {budgetHeadline(b)}.</span>
          {b.note && <span className="muted"> {b.note}.</span>}
        </li>
      ))}
    </ul>
  );
}

export function ApprovalsWindow({ snapshot, writable, demo, now, onDecided, onOpenPerson, budgetAlerts = [] }: Props) {
  const items = snapshot.approvals ?? [];
  return (
    <div className="approvals">
      {budgetAlerts.length > 0 && <CorporateCalls alerts={budgetAlerts} onOpenPerson={onOpenPerson} />}
      <p className="approvals-intro">
        Agents ask here; you sign off. {items.length ? `${items.length} waiting.` : ''} Every decision goes in the audit log first.
      </p>
      {items.length === 0
        ? <p className="approvals-empty">Nothing to sign. Toby will let you know.</p>
        : (
          <ul className="approvals-list">
            {items.map((a) => (
              <ApprovalItem key={a.id} approval={a} blocker={decideBlocker(snapshot, a, writable)} demo={demo} now={now} onDecided={onDecided} onOpenPerson={onOpenPerson} />
            ))}
          </ul>
        )}
    </div>
  );
}
