// The Party Planning Committee calendar: every scheduled job of every bot, as runs in a week or day view, in the
// viewer's time zone. Live data from GET /api/schedule (refreshed every 2 min); demo mode builds the same view locally.
import { useMemo, useState } from 'react';
import type { OfficeSnapshot, Occurrence } from '@shared/contract';
import { localTimeZone } from '@shared/schedule/zone';
import { demoSchedule, fetchSchedule } from '../data/calendarApi';
import { useLoaded } from '../data/useLoaded';
import { NARROW_QUERY } from '../useMediaQuery';
import { CalendarAside } from './CalendarAside';
import { CalendarGrid, type Selection } from './CalendarGrid';
import { type CalendarMode, botColors, daysFor, periodLabel, placeRuns, shiftAnchor } from './layout';

type Props = { snapshot: OfficeSnapshot; demo: boolean; now: number; onOpenPerson: (id: string) => void };

const REFRESH_MS = 120_000;

function Stats({ occurrences, now }: { occurrences: readonly Occurrence[]; now: number }) {
  const count = (run: Occurrence['run']) => occurrences.filter((o) => o.run === run).length;
  const ahead = occurrences.filter((o) => Date.parse(o.at) > now).length;
  return (
    <p className="cal-stats" data-testid="cal-stats">
      <strong>{occurrences.length}</strong> runs · <strong>{ahead}</strong> still to come
      {count('failed') > 0 && <> · <span className="run-word run-failed">{count('failed')} failed</span></>}
      {count('missed') > 0 && <> · <span className="run-word run-missed">{count('missed')} didn’t run</span></>}
    </p>
  );
}

export function CalendarWindow({ snapshot, demo, now, onOpenPerson }: Props) {
  const timeZone = useMemo(localTimeZone, []);
  const [mode, setMode] = useState<CalendarMode>(() => (window.matchMedia?.(NARROW_QUERY).matches ? 'day' : 'week')); // phones: a day
  const [anchor, setAnchor] = useState(now);
  const [selection, setSelection] = useState<Selection>(null);
  const days = useMemo(() => daysFor(mode, anchor, timeZone), [mode, anchor, timeZone]);
  const span = { from: days[0]?.start ?? anchor, to: days.at(-1)?.end ?? anchor };
  const data = useLoaded(`${demo}:${span.from}:${span.to}`,
    (signal) => (demo ? Promise.resolve(demoSchedule(span, now)) : fetchSchedule(span, signal)), demo ? undefined : REFRESH_MS);
  const view = data.value;
  const people = useMemo(() => new Map(snapshot.people.map((p) => [p.id, p])), [snapshot.people]);
  const colors = useMemo(() => botColors(snapshot.people), [snapshot.people]);
  const jobs = useMemo(() => new Map((view?.jobs ?? []).map((j) => [j.key, j])), [view]);
  const placed = useMemo(() => placeRuns(view?.occurrences ?? [], days, timeZone), [view, days, timeZone]);
  const selected = selection && view ? view.occurrences.find((o) => o.jobKey === selection.jobKey && o.at === selection.at) ?? null : null;
  const chair = people.get('angela')?.name ?? 'Angela Martin';

  const select = (o: Occurrence) => {
    setSelection({ jobKey: o.jobKey, at: o.at });
    const owner = jobs.get(o.jobKey)?.personId;
    if (owner) onOpenPerson(owner);
  };

  return (
    <div className="calendar" data-testid="calendar">
      <header className="ppc-header">
        <div className="ppc-bunting" aria-hidden="true" />
        <h3>Party Planning Committee</h3>
        <p>Chair: {chair}. Every scheduled job in the office, approved in advance. No unauthorized streamers.</p>
      </header>
      <div className="cal-toolbar" role="toolbar" aria-label="Calendar">
        <button type="button" className="cal-btn" aria-label={mode === 'week' ? 'Previous week' : 'Previous day'} onClick={() => setAnchor((a) => shiftAnchor(a, mode, -1, timeZone))}>‹</button>
        <button type="button" className="cal-btn" onClick={() => setAnchor(now)}>Today</button>
        <button type="button" className="cal-btn" aria-label={mode === 'week' ? 'Next week' : 'Next day'} onClick={() => setAnchor((a) => shiftAnchor(a, mode, 1, timeZone))}>›</button>
        <h4 className="cal-period" aria-live="polite">{periodLabel(days)}</h4>
        <div className="cal-modes" role="group" aria-label="View">
          {(['week', 'day'] as const).map((m) => (
            <button key={m} type="button" className="cal-btn" aria-pressed={mode === m} onClick={() => setMode(m)}>{m === 'week' ? 'Week' : 'Day'}</button>
          ))}
        </div>
      </div>
      <p className="cal-zone muted">
        Times in your zone, {timeZone}.{view?.truncated ? ' Busy week: some runs are left out.' : ''}{data.loading && view ? ' Updating…' : ''}
      </p>
      {view && <Stats occurrences={view.occurrences} now={now} />}
      {data.error && (
        <p className="cal-error" role="alert">Couldn’t load the schedule: {data.error} <button type="button" className="link-btn" onClick={data.reload}>Try again</button></p>
      )}
      {!view && !data.error && <p className="muted" role="status">Fetching the committee’s calendar…</p>}
      {view && (
        <div className="cal-body">
          <CalendarGrid mode={mode} days={days} placed={placed} timeZone={timeZone} jobs={jobs} people={people} colors={colors}
            now={now} selected={selection} onSelect={select} />
          <CalendarAside view={view} selected={selected} jobs={jobs} people={people} colors={colors} timeZone={timeZone} now={now}
            live={!demo} onOpenPerson={onOpenPerson} />
        </div>
      )}
    </div>
  );
}
