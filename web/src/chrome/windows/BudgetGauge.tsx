// "Corporate": a bot's budget gauges (today, this month) in its window, and every budget in Angela's ledger. Amber
// from 80%, red at 100%; unpriced usage says "can't price <model>" instead of counting as spend.
import type { BudgetStatus, BudgetsReport } from '@shared/controls';
import { budgetHeadline, gaugeLines } from '../../budgets/budgetModel';

function Lines({ status }: { status: BudgetStatus }) {
  return (
    <ul className="budget-lines">
      {gaugeLines(status).map((g) => (
        <li key={g.period} className={`budget-line level-${g.level}`}>
          <span className="budget-label">{g.label}</span>
          <span className="budget-track" role="meter" aria-label={`${g.label}: ${g.text}`} aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.round(g.bar * 100)} aria-valuetext={`${g.text}${g.pctText ? `, ${g.pctText}` : ''}`}>
            <span className="budget-bar" style={{ width: `${(g.bar * 100).toFixed(1)}%` }} />
          </span>
          <span className="budget-value">{g.text}{g.pctText ? ` · ${g.pctText}` : ''}</span>
          {g.note && <span className="budget-note">{g.note}</span>}
        </li>
      ))}
    </ul>
  );
}

export function BudgetGauge({ status }: { status: BudgetStatus }) {
  const headline = budgetHeadline(status);
  return (
    <section className={`budget level-${status.level}`} aria-label="Budget" data-testid="budget-gauge">
      <h3>Budget <span className="muted">· Corporate</span></h3>
      {headline && <p className={`budget-headline level-${status.level}`}>{headline}</p>}
      <Lines status={status} />
      {(status.note || status.unavailable) && <p className="budget-why">{status.note ?? status.unavailable}</p>}
    </section>
  );
}

/** Angela's ledger: every budgeted bot, worst first. */
export function BudgetList({ report, onOpen }: { report: BudgetsReport; onOpen: (personId: string) => void }) {
  if (!report.budgets.length) return null;
  return (
    <section className="budget-list" aria-label="Budgets" data-testid="ledger-budgets">
      <h3>Budgets <span className="muted">· Corporate{report.autoPause ? ' pauses at 100% when it can' : ' alerts at 100%'}</span></h3>
      <ul>
        {report.budgets.map((b) => {
          const headline = budgetHeadline(b);
          return (
            <li key={b.personId} className={`budget-row level-${b.level}`} data-budget={b.personId}>
              <button type="button" className="link-btn budget-who" onClick={() => onOpen(b.personId)}>{b.name}</button>
              {headline && <span className={`budget-headline level-${b.level}`}>{headline}</span>}
              <Lines status={b} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
