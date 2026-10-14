// Person window: who they are, their bot, live status, its budget, controls, tasks, scheduled jobs and their chat room.
import type { OfficeSnapshot, Person } from '@shared/contract';
import type { BudgetStatus } from '@shared/controls';
import { AREAS, SEATS } from '@shared/office';
import { presenceFor } from '../../office/status';
import { Portrait } from '../Portrait';
import { ChatPanel } from './ChatPanel';
import { JobList, StatusLine, TaskList } from './sections';
import { shortName } from '../../office/names';
import { offeredControls } from '../../office/controls';
import { BudgetGauge } from './BudgetGauge';
import { ControlsPanel, JobControls, TaskControls } from './ControlsPanel';
import { type PendingControl, useControls } from './useControls';

type Props = {
  person: Person; snapshot: OfficeSnapshot; demo: boolean; writable: boolean; now: number; onOpenArea: (areaId: string, roomId?: string) => void;
  budget?: BudgetStatus; // Corporate: this bot's budget, when it has one
  pendingControl?: PendingControl; // Ask Pam asked for a control verb: open its confirmation
};

const areaName = (id?: string) => AREAS.find((a) => a.id === id)?.name ?? 'the office';
/** A Hermes bot's second name is its persona; any other agent's is just its own name. */
const personaLabel = (p: Person) => ((p.bot?.adapter ?? 'hermes') === 'hermes' ? 'Hermes persona' : 'Agent');

export function PersonWindow({ person, snapshot, demo, writable, now, onOpenArea, budget, pendingControl }: Props) {
  const presence = presenceFor(person, snapshot.presence);
  const controls = useControls(person, snapshot, demo, pendingControl);
  const offered = offeredControls(person, writable);
  const deskArea = SEATS.find((s) => s.id === person.seatId)?.areaId;
  const dm = snapshot.rooms.find((r) => r.kind === 'dm' && r.memberIds[0] === person.id)
    ?? snapshot.rooms.find((r) => r.kind === 'dm' && r.memberIds.includes(person.id));
  const leads = snapshot.rooms.filter((r) => r.kind !== 'dm' && r.memberIds[0] === person.id);
  const inRoom = presence.roomId ? snapshot.rooms.find((r) => r.id === presence.roomId) : undefined;
  const tasks = snapshot.tasks.filter((t) => t.ownerId === person.id);
  const jobs = snapshot.jobs?.[person.id] ?? [];

  return (
    <div className="person-window">
      <div className="persona">
        <Portrait person={person} live={!demo} />
        <div>
          <p className="persona-title">{person.title}</p>
          {person.persona && <p className="persona-alias">{personaLabel(person)}: {person.persona}</p>}
          {person.bot
            ? <p><span className="tag tag-bot">{person.bot.profile}</span> {person.bot.role}</p>
            : <p className="muted">No bot yet — {shortName(person.name)} doesn’t have a Hermes bot.</p>}
          {person.bot && <StatusLine presence={presence} now={now} />}
        </div>
      </div>

      {person.bot && (
        <dl className="facts">
          <dt>Activity</dt>
          <dd>{presence.activity ?? '—'}</dd>
          <dt>Where</dt>
          <dd>{inRoom ? `In ${inRoom.name} — ${areaName(inRoom.areaId)}` : `At their desk — ${areaName(deskArea)}`}</dd>
          {leads.length > 0 && (
            <>
              <dt>Leads</dt>
              <dd>
                {leads.map((r, i) => (
                  <span key={r.id}>
                    {i > 0 && ', '}
                    <button type="button" className="link-btn" onClick={() => onOpenArea(r.areaId, r.id)}>{r.name}</button>
                    <span className="muted"> ({areaName(r.areaId)})</span>
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>
      )}

      {person.bot && budget && <BudgetGauge status={budget} />}
      {person.bot && <ControlsPanel person={person} snapshot={snapshot} offered={offered} controls={controls} />}

      {person.bot && (
        <>
          <h3>Tasks</h3>
          <TaskList tasks={tasks} empty="No tasks right now." actions={(t) => <TaskControls task={t} offered={offered} controls={controls} />} />
          <h3>Scheduled</h3>
          <JobList jobs={jobs} now={now} actions={(j) => <JobControls job={j} offered={offered} controls={controls} />} />
        </>
      )}

      {dm ? (
        <>
          <h3 className="chat-heading">Chat room: {dm.name} — {areaName(dm.areaId)}</h3>
          <ChatPanel room={dm} lead={person} people={snapshot.people} demo={demo} writable={writable} />
        </>
      ) : (
        <p className="muted">No chat room — desk in {areaName(deskArea)}.</p>
      )}
    </div>
  );
}
