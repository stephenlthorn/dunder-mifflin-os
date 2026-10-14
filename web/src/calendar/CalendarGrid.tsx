// The week (or day) grid: one column per day, a "frequent" lane for jobs that run all day, then 24 hour rows.
// Every run is a button coloured by its bot, with an icon for how it went (never colour alone).
import type { CSSProperties } from 'react';
import type { CalendarJob, Occurrence, Person } from '@shared/contract';
import { wallTime } from '@shared/schedule/zone';
import { type CalendarMode, type Day, type LaneItem, type Placed, dayKey, dayLabel, hourLabel, timeLabel } from './layout';
import { RUN_META } from './words';

export type Selection = { jobKey: string; at: string } | null;
type Props = {
  mode: CalendarMode;
  days: readonly Day[];
  placed: Placed;
  timeZone: string;
  jobs: ReadonlyMap<string, CalendarJob>;
  people: ReadonlyMap<string, Person>;
  colors: ReadonlyMap<string, string>;
  now: number;
  selected: Selection;
  onSelect: (o: Occurrence) => void;
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const FALLBACK_COLOR = '#7a8594';

type ChipProps = { o: Occurrence; job: CalendarJob; who: string; color: string; mode: CalendarMode; timeZone: string; selected: boolean; onSelect: (o: Occurrence) => void };

function RunChip({ o, job, who, color, mode, timeZone, selected, onSelect }: ChipProps) {
  const time = timeLabel(o.at, timeZone);
  const minutes = wallTime(Date.parse(o.at), timeZone).minute;
  const shown = mode === 'day' ? time : minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`; // the row already says the hour
  const meta = RUN_META[o.run];
  const label = `${job.name}, ${who}, ${time}, ${meta.word}${o.nextUp ? ', next up' : ''}${o.offSchedule ? ', run by hand' : ''}`;
  return (
    <button
      type="button"
      className={`cal-chip run-${o.run}${o.nextUp ? ' is-next' : ''}${selected ? ' is-selected' : ''}`}
      style={{ '--bot': color } as CSSProperties}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onClick={() => onSelect(o)}
    >
      <span className="cal-chip-icon" aria-hidden="true">{meta.icon}</span>
      {shown && <span className="cal-chip-time">{shown}</span>}
      <span className="cal-chip-name">{job.name}</span>
      {mode === 'day' && <span className="cal-chip-who">{who}</span>}
      {o.nextUp && <span className="cal-chip-next">Next up</span>}
    </button>
  );
}

type LaneProps = { item: LaneItem; job: CalendarJob; who: string; color: string; selected: boolean; onSelect: (o: Occurrence) => void };

function LaneChip({ item, job, who, color, selected, onSelect }: LaneProps) {
  const meta = RUN_META[item.run];
  const label = `${job.name}, ${who}: ${item.count} runs this day (${job.schedule}), ${item.run === 'upcoming' ? 'all still to come' : `worst: ${meta.word}`}`;
  return (
    <button
      type="button"
      className={`cal-chip cal-lane-chip run-${item.run}${item.nextUp ? ' is-next' : ''}${selected ? ' is-selected' : ''}`}
      style={{ '--bot': color } as CSSProperties}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onClick={() => onSelect(item.first)}
    >
      <span className="cal-chip-icon" aria-hidden="true">{meta.icon}</span>
      <span className="cal-chip-name">{job.name}</span>
      <span className="cal-chip-count">×{item.count}</span>
    </button>
  );
}

export function CalendarGrid({ mode, days, placed, timeZone, jobs, people, colors, now, selected, onSelect }: Props) {
  const today = dayKey(wallTime(now, timeZone));
  const nowHour = wallTime(now, timeZone).hour;
  const whoOf = (job: CalendarJob) => people.get(job.personId)?.name ?? job.personId;
  const colorOf = (job: CalendarJob) => colors.get(job.personId) ?? FALLBACK_COLOR;
  const isSelected = (o: Occurrence) => selected?.jobKey === o.jobKey && selected.at === o.at;
  return (
    <div className="cal-scroll">
      <div className={`cal-grid mode-${mode}`} style={{ '--days': days.length } as CSSProperties}>
        <div className="cal-gutter" aria-hidden="true">
          <div className="cal-corner" />
          <div className="cal-lane-label">All day</div>
          {HOURS.map((h) => <div key={h} className="cal-hour-label">{hourLabel(h)}</div>)}
        </div>
        {days.map((d) => {
          const label = dayLabel(d);
          const lanes = placed.lanes.get(d.key) ?? [];
          return (
            <section key={d.key} className={`cal-day${d.key === today ? ' is-today' : ''}`} aria-label={`${label.weekday} ${label.date}`} data-day={d.key}>
              <h4 className="cal-day-head">
                <span>{label.weekday}</span> <strong>{label.date}</strong>{d.key === today && <span className="cal-today-tag">Today</span>}
              </h4>
              <div className="cal-lane">
                {lanes.flatMap((item) => {
                  const job = jobs.get(item.jobKey);
                  return job ? [<LaneChip key={item.jobKey} item={item} job={job} who={whoOf(job)} color={colorOf(job)}
                    selected={selected?.jobKey === item.jobKey} onSelect={onSelect} />] : [];
                })}
              </div>
              {HOURS.map((h) => (
                <div key={h} className={`cal-cell${d.key === today && h === nowHour ? ' is-now' : ''}`}>
                  {(placed.cells.get(`${d.key}|${h}`) ?? []).flatMap((o) => {
                    const job = jobs.get(o.jobKey);
                    return job ? [<RunChip key={`${o.jobKey}@${o.at}`} o={o} job={job} who={whoOf(job)} color={colorOf(job)} mode={mode}
                      timeZone={timeZone} selected={isSelected(o)} onSelect={onSelect} />] : [];
                  })}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
