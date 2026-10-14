// The open OS windows: person windows (Desk and Timeline tabs), room (area) windows, HR · Approvals, Angela's ledger,
// the Party Planning Committee calendar, the Dundies and Creed's corner, each in a draggable frame (a sheet on phones).
import type { Dispatch, SetStateAction } from 'react';
import type { Approval, OfficeSnapshot, Task } from '@shared/contract';
import type { BudgetsReport } from '@shared/controls';
import type { Decision } from '../../data/approvalsApi';
import { budgetAlerts, budgetOf } from '../../budgets/budgetModel';
import type { PendingControl } from './useControls';
import { ApprovalsWindow } from './ApprovalsWindow';
import { presenceFor, statusWord } from '../../office/status';
import { CalendarWindow } from '../../calendar/CalendarWindow';
import { AreaWindow, MINUTES_AREA, selectedRoom } from './AreaWindow';
import { LedgerWindow } from './LedgerWindow';
import { PersonTabs } from './PersonTabs';
import { titleOf } from './titles';
import { WindowFrame } from './WindowFrame';
import { MINUTES_TAB, type WindowsState, closeWindow, focusWindow, moveWindow, setAreaRoom, setPersonTab, toggleMinimize, topWindow } from './windowState';
import { useDelight } from '../../delight/DelightContext';
import { CreedWindow } from '../../delight/creed/CreedWindow';
import { DundiesWindow } from '../../delight/dundies/DundiesWindow';

type Props = {
  wins: WindowsState;
  setWins: Dispatch<SetStateAction<WindowsState>>;
  snapshot: OfficeSnapshot;
  demo: boolean;
  writable: boolean; // false on a read-only server: no chat composer, no new-task form
  now: number;
  sheet: boolean;
  onOpenPerson: (id: string) => void;
  onOpenArea: (areaId: string, roomId?: string) => void;
  onTaskCreated: (task: Task) => void;
  onDecided: (approval: Approval, decision: Decision) => void;
  onOpenLedger: () => void;
  onOpenTimeline: (personId: string) => void;
  onOpenCalendar: () => void;
  budgets?: BudgetsReport | null; // Corporate
  pendingControl?: PendingControl; // a control verb Ask Pam asked for
};

export function WindowLayer({
  wins, setWins, snapshot, demo, writable, now, sheet, onOpenPerson, onOpenArea, onTaskCreated, onDecided, onOpenLedger, onOpenTimeline,
  onOpenCalendar, budgets = null, pendingControl,
}: Props) {
  const { mode } = useDelight();
  return (
    <>
      {wins.windows.map((w) => {
        const frame = {
          win: w,
          title: titleOf(w, snapshot, mode.toby),
          sheet,
          onFocus: () => setWins((s) => (topWindow(s)?.id === w.id ? s : focusWindow(s, w.id))),
          onClose: () => setWins((s) => closeWindow(s, w.id)),
          onMinimize: () => setWins((s) => toggleMinimize(s, w.id)),
          onMove: (x: number, y: number) => setWins((s) => moveWindow(s, w.id, x, y)),
        };
        if (w.ref.kind === 'calendar') {
          return (
            <WindowFrame key={w.id} {...frame} subtitle="every scheduled job" size="xl">
              <CalendarWindow snapshot={snapshot} demo={demo} now={now} onOpenPerson={onOpenPerson} />
            </WindowFrame>
          );
        }
        if (w.ref.kind === 'dundies') {
          return (
            <WindowFrame key={w.id} {...frame} subtitle={mode.toby ? 'the last 7 days' : 'presented by Michael Scott'} size="wide">
              <DundiesWindow snapshot={snapshot} live={!demo} onOpenPerson={onOpenPerson} />
            </WindowFrame>
          );
        }
        if (w.ref.kind === 'creed') {
          return (
            <WindowFrame key={w.id} {...frame} subtitle={mode.toby ? 'no desk can hold it' : 'Creed Bratton’s desk'}>
              <CreedWindow now={now} />
            </WindowFrame>
          );
        }
        if (w.ref.kind === 'approvals') {
          return (
            <WindowFrame key={w.id} {...frame} subtitle="Toby Flenderson's desk">
              <ApprovalsWindow snapshot={snapshot} writable={writable} demo={demo} now={now} onDecided={onDecided} onOpenPerson={onOpenPerson}
                budgetAlerts={budgetAlerts(budgets)} />
            </WindowFrame>
          );
        }
        if (w.ref.kind === 'person') {
          const id = w.ref.personId;
          const person = snapshot.people.find((p) => p.id === id);
          if (!person) return null;
          const p = presenceFor(person, snapshot.presence);
          const subtitle = person.bot ? `${person.bot.profile} · ${statusWord(p.status)}` : 'no bot yet';
          return (
            <WindowFrame key={w.id} {...frame} subtitle={subtitle}>
              <PersonTabs person={person} snapshot={snapshot} demo={demo} writable={writable} now={now} tab={w.ref.tab ?? 'desk'}
                onTab={(tab) => setWins((s) => setPersonTab(s, w.id, tab))} onOpenArea={onOpenArea} onOpenLedger={onOpenLedger}
                budget={budgetOf(budgets, id)} pendingControl={pendingControl} />
            </WindowFrame>
          );
        }
        if (w.ref.kind === 'ledger') {
          return (
            <WindowFrame key={w.id} {...frame} subtitle="tokens and estimated cost per bot">
              <LedgerWindow snapshot={snapshot} demo={demo} onOpenTimeline={onOpenTimeline} budgets={budgets} onOpenPerson={onOpenPerson} />
            </WindowFrame>
          );
        }
        const areaId = w.ref.areaId;
        const room = selectedRoom(snapshot, areaId, w.ref.roomId);
        if (!room) return null;
        const minutes = areaId === MINUTES_AREA && w.ref.roomId === MINUTES_TAB;
        return (
          <WindowFrame key={w.id} {...frame} subtitle={minutes ? 'minutes' : room.kind} {...(minutes ? { size: 'wide' as const } : {})}>
            <AreaWindow
              areaId={areaId}
              room={room}
              snapshot={snapshot}
              demo={demo}
              writable={writable}
              onSelectRoom={(roomId) => setWins((s) => setAreaRoom(s, w.id, roomId))}
              onOpenPerson={onOpenPerson}
              onTaskCreated={onTaskCreated}
              minutes={minutes ? { now } : undefined}
              onOpenCalendar={onOpenCalendar}
            />
          </WindowFrame>
        );
      })}
    </>
  );
}
