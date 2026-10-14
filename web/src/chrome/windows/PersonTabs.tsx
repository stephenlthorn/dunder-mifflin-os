// A bot's person window has two tabs: Desk (who they are, status, tasks, jobs, chat) and Timeline (the documentary
// crew: what they did and the day in one paragraph). Angela's window also opens her ledger.
import type { OfficeSnapshot, Person } from '@shared/contract';
import type { BudgetStatus } from '@shared/controls';
import type { PendingControl } from './useControls';
import { PersonWindow } from './PersonWindow';
import { TimelinePanel } from './TimelinePanel';
import type { PersonTab } from './windowState';

type Props = {
  person: Person;
  snapshot: OfficeSnapshot;
  demo: boolean;
  writable: boolean;
  now: number;
  tab: PersonTab;
  onTab: (tab: PersonTab) => void;
  onOpenArea: (areaId: string, roomId?: string) => void;
  onOpenLedger: () => void;
  budget?: BudgetStatus;
  pendingControl?: PendingControl;
};

export const LEDGER_KEEPER = 'angela';

export function PersonTabs({ person, snapshot, demo, writable, now, tab, onTab, onOpenArea, onOpenLedger, budget, pendingControl }: Props) {
  const desk = (
    <PersonWindow person={person} snapshot={snapshot} demo={demo} writable={writable} now={now} onOpenArea={onOpenArea} budget={budget} pendingControl={pendingControl} />
  );
  const ledger = person.id === LEDGER_KEEPER && (
    <button type="button" className="ledger-link" onClick={onOpenLedger}>Open Angela’s ledger: tokens and cost per bot</button>
  );
  if (!person.bot) return <>{ledger}{desk}</>;
  const id = `tabs-${person.id}`;
  return (
    <div className="person-tabs">
      <div className="tabs" role="tablist" aria-label={`${person.name} views`}>
        {(['desk', 'timeline'] as const).map((t) => (
          <button key={t} id={`${id}-${t}`} type="button" role="tab" className="tab" aria-selected={tab === t} aria-controls={`${id}-panel`} onClick={() => onTab(t)}>
            {t === 'desk' ? 'Desk' : 'Timeline'}
          </button>
        ))}
      </div>
      {ledger}
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
        {tab === 'timeline' ? <TimelinePanel person={person} snapshot={snapshot} demo={demo} /> : desk}
      </div>
    </div>
  );
}
