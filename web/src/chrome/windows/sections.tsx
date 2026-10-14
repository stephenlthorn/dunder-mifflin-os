// Small presentational pieces shared by the person and room windows.
import type { ReactNode } from 'react';
import type { Person, Presence, ScheduledJob, Task } from '@shared/contract';
import { STATUS_META, sinceText, statusWord } from '../../office/status';
import { jobTiming } from '../../office/jobs';
import { Portrait } from '../Portrait';

export function StatusLine({ presence, now }: { presence: Presence; now: number }) {
  const meta = STATUS_META[presence.status];
  const since = sinceText(presence.since, now);
  return (
    <p className="status-line" data-testid="status-line">
      <span className="dot" style={{ background: meta.color }} aria-hidden="true" />
      <strong>{meta.legend}</strong>
      {since && <span className="muted"> · since {since}</span>}
    </p>
  );
}

/** Shown instead of a write control (chat composer, new-task form) when the server is read-only. */
export function ReadOnlyHint({ what }: { what: string }) {
  return (
    <p className="read-only-hint" role="note">
      Read-only: {what} is off. Restart the server with <code>DMOS_ALLOW_WRITES=1</code> (or <code>--allow-writes</code>) to turn it on.
    </p>
  );
}

const TASK_LABEL: Record<Task['status'], string> = { todo: 'To do', doing: 'Doing', blocked: 'Blocked', done: 'Done' };

/** `actions`: buttons at the end of a row (a bot's own window: Stop, Reassign…). */
export function TaskList({ tasks, empty, actions }: { tasks: readonly Task[]; empty: string; actions?: (t: Task) => ReactNode }) {
  if (tasks.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="task-list">
      {tasks.map((t) => (
        <li key={t.id}>
          <span className={`task-badge badge-${t.status}`}>{TASK_LABEL[t.status]}</span>
          <span>{t.title}</span>
          {t.shared && <span className="tag">shared</span>}
          {actions?.(t)}
        </li>
      ))}
    </ul>
  );
}

export function JobList({ jobs, now, actions }: { jobs: readonly ScheduledJob[]; now: number; actions?: (j: ScheduledJob) => ReactNode }) {
  if (jobs.length === 0) return <p className="muted">No scheduled jobs.</p>;
  return (
    <ul className="job-list">
      {jobs.map((j, i) => (
        <li key={`${i}-${j.name}`} className={j.enabled ? '' : 'is-off'}>
          <strong>{j.name}</strong> <span className="muted">{j.schedule}{j.enabled ? '' : ' · paused'}</span>
          <span className="job-meta">{jobTiming(j, now)}</span>
          {actions?.(j)}
        </li>
      ))}
    </ul>
  );
}

type MemberListProps = { members: readonly Person[]; presenceOf: (p: Person) => Presence; onOpen: (id: string) => void; live: boolean };

export function MemberList({ members, presenceOf, onOpen, live }: MemberListProps) {
  if (members.length === 0) return <p className="muted">Nobody yet.</p>;
  return (
    <ul className="member-list">
      {members.map((m) => {
        const p = presenceOf(m);
        return (
          <li key={m.id}>
            <button type="button" className="link-btn" onClick={() => onOpen(m.id)}>
              <Portrait person={m} live={live} size="sm" decorative />
              <span className="dot" style={{ background: STATUS_META[p.status].color }} aria-hidden="true" />
              {m.name}
            </button>
            <span className="muted"> {m.bot ? `${m.bot.profile} · ${statusWord(p.status)}` : 'no bot yet'}</span>
          </li>
        );
      })}
    </ul>
  );
}
