// "While you were away": a small card that lists what changed while the tab was in the background.
import { STATUS_META } from '../office/status';
import type { AwayKind } from './away';
import type { AwayReport } from './useNotifications';

const MAX_LINES = 6;
const DOT: Record<AwayKind, string> = {
  error: STATUS_META.error.color, 'needs-you': '#c2410c', recovered: STATUS_META.working.color, working: STATUS_META.working.color,
  meeting: STATUS_META.meeting.color, idle: STATUS_META.idle.color, offline: STATUS_META.offline.color, online: STATUS_META.working.color, task: '#6f675c',
};

type Props = { report: AwayReport; onOpenPerson: (id: string) => void; onDismiss: () => void };

export function AwaySummary({ report, onOpenPerson, onDismiss }: Props) {
  const shown = report.lines.slice(0, MAX_LINES);
  const more = report.lines.length - shown.length;
  return (
    <section className="away" role="region" aria-label="While you were away" aria-live="polite">
      <header className="away-head">
        <strong>While you were away</strong>
        <span className="muted">· {report.away}</span>
        <button type="button" className="away-close" aria-label="Dismiss" onClick={onDismiss}>×</button>
      </header>
      <ul>
        {shown.map((line, i) => (
          <li key={`${i}-${line.text}`} className={`away-${line.kind}`}>
            <span className="dot" style={{ background: DOT[line.kind] }} aria-hidden="true" />
            {line.personId
              ? <button type="button" className="link-btn" onClick={() => onOpenPerson(line.personId!)}>{line.text}</button>
              : <span>{line.text}</span>}
          </li>
        ))}
      </ul>
      {more > 0 && <p className="muted away-more">and {more} more</p>}
    </section>
  );
}
