// "Angela's ledger": tokens and estimated cost per bot for today, 7 or 30 days, biggest first, with bars drawn to
// scale and the totals. Every cost is an estimate; a bot whose adapter keeps no usage says so instead of showing 0.
import { useState } from 'react';
import type { OfficeSnapshot } from '@shared/contract';
import type { BudgetsReport } from '@shared/controls';
import { BudgetList } from './BudgetGauge';
import { USAGE_PERIODS, type UsagePeriod } from '@shared/observability';
import { Portrait } from '../Portrait';
import { type LedgerMetric, type LedgerRow, formatTokens, ledgerView } from '../../observability/ledgerModel';
import { useUsage } from '../../observability/useObservability';

type Props = {
  snapshot: OfficeSnapshot; demo: boolean; onOpenTimeline: (personId: string) => void;
  budgets?: BudgetsReport | null; onOpenPerson?: (personId: string) => void; // Corporate's budgets
};

const PERIOD_LABEL: Record<UsagePeriod, string> = { today: 'Today', '7d': '7 days', '30d': '30 days' };

function Row({ row, person, live, onOpen }: { row: LedgerRow; person?: OfficeSnapshot['people'][number]; live: boolean; onOpen: () => void }) {
  return (
    <li className={`ledger-row${row.available ? '' : ' is-unavailable'}`} data-person-row={row.personId}>
      <button type="button" className="ledger-who link-btn" onClick={onOpen} aria-label={`${row.name}: open their timeline`}>
        {person && <Portrait person={person} live={live} size="sm" decorative />}
        <span className="ledger-name">{row.name}</span>
      </button>
      {row.available ? (
        <>
          <span className="ledger-track" aria-hidden="true"><span className="ledger-bar" style={{ width: `${(row.bar * 100).toFixed(1)}%` }} /></span>
          <span className="ledger-value">{row.valueText}</span>
          <span className="ledger-sub">{formatTokens(row.tokensIn)} in · {formatTokens(row.tokensOut)} out · {row.adapterLabel}{row.note ? ` · ${row.note}` : ''}</span>
        </>
      ) : <span className="ledger-sub ledger-none">{row.note}</span>}
    </li>
  );
}

export function LedgerWindow({ snapshot, demo, onOpenTimeline, budgets = null, onOpenPerson = onOpenTimeline }: Props) {
  const [period, setPeriod] = useState<UsagePeriod>('today');
  const [metric, setMetric] = useState<LedgerMetric>('cost');
  const usage = useUsage(period, { demo, snapshot });
  const report = usage.phase === 'ready' ? usage.data : null;
  const view = report ? ledgerView(report, metric) : null;

  return (
    <div className="ledger-window">
      {budgets && <BudgetList report={budgets} onOpen={onOpenPerson} />}
      <div className="tabs" role="tablist" aria-label="Period">
        {USAGE_PERIODS.map((p) => (
          <button key={p} type="button" role="tab" className="tab" aria-selected={period === p} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</button>
        ))}
      </div>
      <div className="tl-controls">
        <div className="tl-chips" role="group" aria-label="Bars show">
          {(['cost', 'tokens'] as const).map((m) => (
            <button key={m} type="button" className="chip-btn" aria-pressed={metric === m} onClick={() => setMetric(m)}>{m === 'cost' ? 'Estimated cost' : 'Tokens'}</button>
          ))}
        </div>
      </div>
      {usage.phase === 'loading' && <p className="muted" role="status">Angela is counting…</p>}
      {usage.phase === 'error' && <p className="chat-error" role="alert">{usage.error}</p>}
      {view && report && (
        <>
          <p className="ledger-total" data-testid="ledger-total">
            <strong>Total {view.totalText}</strong>
            <span className="muted"> · {formatTokens(view.totalTokensIn)} in · {formatTokens(view.totalTokensOut)} out{view.partial ? ' · some models unpriced' : ''}</span>
          </p>
          <ol className="ledger-list" aria-label={`Usage per bot, ${PERIOD_LABEL[period].toLowerCase()}`}>
            {view.rows.map((row) => (
              <Row key={row.personId} row={row} person={snapshot.people.find((p) => p.id === row.personId)} live={!demo} onOpen={() => onOpenTimeline(row.personId)} />
            ))}
          </ol>
          <p className="ledger-foot muted">
            Estimates, in USD. A bot’s own recorded cost comes first, then the price table of {report.priceTable.asOf}; unpriced models are left out
            of the cost. Add prices under <code>prices:</code> in config.yaml.
          </p>
        </>
      )}
    </div>
  );
}
