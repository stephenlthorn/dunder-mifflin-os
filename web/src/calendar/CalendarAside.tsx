// The calendar's side panel: what's next up, the chosen run's job (with a button to its bot's window), and the key.
import type { CSSProperties } from 'react';
import type { CalendarJob, Occurrence, Person, ScheduleView } from '@shared/contract';
import { Portrait } from '../chrome/Portrait';
import { shortName } from '../office/names';
import { timeLabel } from './layout';
import { RUN_META, inText, repeatsText } from './words';

type Props = {
  view: ScheduleView | null;
  selected: Occurrence | null;
  jobs: ReadonlyMap<string, CalendarJob>;
  people: ReadonlyMap<string, Person>;
  colors: ReadonlyMap<string, string>;
  timeZone: string;
  now: number;
  live: boolean;
  onOpenPerson: (id: string) => void;
};

const dateTime = (iso: string, timeZone: string) =>
  `${new Intl.DateTimeFormat(undefined, { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso))}, ${timeLabel(iso, timeZone)}`;

function Swatch({ color }: { color: string }) {
  return <span className="cal-swatch" style={{ '--bot': color } as CSSProperties} aria-hidden="true" />;
}

function JobCard({ job, run, people, colors, timeZone, live, onOpenPerson }: { job: CalendarJob; run: Occurrence } & Omit<Props, 'view' | 'selected' | 'jobs' | 'now'>) {
  const person = people.get(job.personId);
  const name = person?.name ?? job.personId;
  return (
    <section className="cal-card cal-job" aria-label={`Job: ${job.name}`} data-testid="cal-job">
      <h4><Swatch color={colors.get(job.personId) ?? '#7a8594'} />{job.name}</h4>
      <dl className="facts">
        <dt>Bot</dt>
        <dd>{person && <Portrait person={person} live={live} size="sm" decorative />}{name}</dd>
        <dt>Repeats</dt>
        <dd><code>{repeatsText(job)}</code></dd>
        <dt>This run</dt>
        <dd>{dateTime(run.at, timeZone)} · <span className={`run-word run-${run.run}`}>{RUN_META[run.run].icon} {RUN_META[run.run].word}</span>{run.offSchedule ? ' (run by hand)' : ''}</dd>
        {job.lastRunAt && (<><dt>Last run</dt><dd>{dateTime(job.lastRunAt, timeZone)}{job.lastStatus ? ` · ${job.lastStatus}` : ''}</dd></>)}
        {job.enabled && job.nextRunAt && (<><dt>Next run</dt><dd>{dateTime(job.nextRunAt, timeZone)}</dd></>)}
        {job.timeZone !== timeZone && (<><dt>Runs on</dt><dd>{job.timeZone} time</dd></>)}
      </dl>
      <button type="button" className="cal-open-bot" onClick={() => onOpenPerson(job.personId)}>Open {shortName(name)}’s window</button>
    </section>
  );
}

export function CalendarAside({ view, selected, jobs, people, colors, timeZone, now, live, onOpenPerson }: Props) {
  const next = view?.nextUp;
  const nextJob = next ? jobs.get(next.jobKey) : undefined;
  const job = selected ? jobs.get(selected.jobKey) : undefined;
  const owners = [...new Set(view?.jobs.map((j) => j.personId) ?? [])].flatMap((id) => people.get(id) ?? []);
  return (
    <aside className="cal-aside">
      <section className="cal-card cal-next" aria-label="Next up" data-testid="cal-next">
        <h4>Next up</h4>
        {next && nextJob ? (
          <p>
            <Swatch color={colors.get(nextJob.personId) ?? '#7a8594'} /><strong>{nextJob.name}</strong>
            <span className="muted"> · {people.get(nextJob.personId)?.name ?? nextJob.personId}</span><br />
            {dateTime(next.at, timeZone)} <span className="muted">({inText(next.at, now)})</span>
          </p>
        ) : <p className="muted">Nothing scheduled. Angela approves.</p>}
      </section>
      {job && selected
        ? <JobCard job={job} run={selected} people={people} colors={colors} timeZone={timeZone} live={live} onOpenPerson={onOpenPerson} />
        : <p className="cal-hint muted">Pick a run to see its job. Its bot’s window opens too.</p>}
      <section className="cal-card cal-key" aria-label="Key">
        <h4>Committee members</h4>
        <ul className="cal-bots">
          {owners.map((p) => <li key={p.id}><Swatch color={colors.get(p.id) ?? '#7a8594'} />{p.name}</li>)}
        </ul>
        <ul className="cal-runs">
          {(['ok', 'failed', 'missed', 'upcoming'] as const).map((r) => (
            <li key={r}><span className={`cal-chip-icon run-${r}`} aria-hidden="true">{RUN_META[r].icon}</span>{RUN_META[r].key}</li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
