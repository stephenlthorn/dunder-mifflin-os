// The Controls section of a bot's window: Pause / Resume / Stop (as its adapter allows), the in-page confirmation
// step (what will happen, then Confirm or Cancel; never the browser's confirm()) and the server's answer. Row buttons
// on cards (Stop, Reassign…) and jobs (Run now) open the same confirmation.
import { type KeyboardEvent, useEffect, useId, useRef } from 'react';
import type { OfficeSnapshot, Person, ScheduledJob, Task } from '@shared/contract';
import { readyToSend } from '../../office/controlFlow';
import { type OfferedControls, confirmCopy, reassignTargets, runningTasks, stopsCardsOnly } from '../../office/controls';
import { shortName } from '../../office/names';
import type { Controls } from './useControls';

type PanelProps = { person: Person; snapshot: OfficeSnapshot; offered: OfferedControls; controls: Controls };

function ConfirmBox({ person, snapshot, controls }: Omit<PanelProps, 'offered'>) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const { flow } = controls;
  const phase = flow.phase;
  useEffect(() => {
    if (phase === 'confirm') box.current?.querySelector<HTMLElement>('select, button')?.focus();
  }, [phase]);
  if (flow.phase === 'idle') return null;
  const copy = confirmCopy(flow.request, { person, snapshot });
  const sending = flow.phase === 'sending';
  const reassign = flow.request.action === 'reassign' ? flow.request.args : null;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !sending) {
      e.stopPropagation(); // Esc cancels the confirmation, not the window
      controls.cancel();
    }
  };
  return (
    <div ref={box} className={`control-confirm tone-${copy.tone}`} role="group" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} data-testid="control-confirm" onKeyDown={onKeyDown}>
      <p id={`${id}-t`} className="control-confirm-title">{copy.title}</p>
      <p id={`${id}-d`} className="control-confirm-detail">{copy.detail}</p>
      {reassign && (
        <label className="control-target">
          Hand it to{' '}
          <select value={reassign.to} disabled={sending} onChange={(e) => controls.choose(e.target.value)}>
            <option value="">Pick a bot…</option>
            {reassignTargets(person, snapshot).map((p) => <option key={p.id} value={p.id}>{p.name}{p.bot ? ` (${p.bot.profile})` : ''}</option>)}
          </select>
        </label>
      )}
      <div className="control-confirm-actions">
        <button type="button" className="control-go" disabled={sending || !readyToSend(flow)} onClick={() => void controls.confirm()}>
          {sending ? 'Working…' : copy.confirm}
        </button>
        <button type="button" className="control-cancel" disabled={sending} onClick={controls.cancel}>Cancel</button>
      </div>
    </div>
  );
}

export function ControlsPanel({ person, snapshot, offered, controls }: PanelProps) {
  if (!offered.pause && !offered.stop && !offered.runJob && !offered.reassign) return null;
  const first = shortName(person.name);
  const running = runningTasks(person, snapshot);
  const cardsOnly = stopsCardsOnly(person); // Hermes and the demo stop kanban cards, nothing else
  const hermes = (person.bot?.adapter ?? 'hermes') === 'hermes';
  const stopOne = running.length === 1 ? { action: 'stop' as const, args: { taskId: running[0]!.id } } : { action: 'stop' as const };
  const stopHint = cardsOnly && running.length === 0 ? 'Nothing running on the board' : cardsOnly && running.length > 1 ? 'Stop one of the running cards below' : undefined;
  const { flow } = controls;
  return (
    <section className="controls" aria-label={`Controls for ${first}`}>
      <h3>Controls</h3>
      <div className="control-bar">
        {offered.pause && <button type="button" onClick={() => controls.ask({ action: 'pause' })}>Pause</button>}
        {offered.pause && <button type="button" onClick={() => controls.ask({ action: 'resume' })}>Resume</button>}
        {offered.stop && (
          <button type="button" disabled={stopHint !== undefined} title={stopHint} onClick={() => controls.ask(stopOne)}>Stop current run</button>
        )}
        {!offered.pause && <span className="control-note">{first} can’t be paused from here{hermes ? ': Hermes has no per-bot pause' : ''}.</span>}
      </div>
      <ConfirmBox person={person} snapshot={snapshot} controls={controls} />
      {flow.phase === 'idle' && flow.result && (
        <p className={`control-result ${flow.result.ok ? 'is-ok' : 'is-error'}`} role={flow.result.ok ? 'status' : 'alert'}>{flow.result.text}</p>
      )}
    </section>
  );
}

/** Stop / Reassign… on a card in the bot's task list. */
export function TaskControls({ task, offered, controls }: { task: Task; offered: OfferedControls; controls: Controls }) {
  if (task.status === 'done') return null;
  return (
    <span className="row-controls">
      {offered.stop && task.status === 'doing' && (
        <button type="button" aria-label={`Stop “${task.title}”`} onClick={() => controls.ask({ action: 'stop', args: { taskId: task.id } })}>Stop</button>
      )}
      {offered.reassign && (
        <button type="button" aria-label={`Reassign “${task.title}”`} onClick={() => controls.ask({ action: 'reassign', args: { taskId: task.id, to: '' } })}>Reassign…</button>
      )}
    </span>
  );
}

/** Run now on a scheduled job (switched on, with an id the server gave). */
export function JobControls({ job, offered, controls }: { job: ScheduledJob; offered: OfferedControls; controls: Controls }) {
  if (!offered.runJob || !job.id || !job.enabled) return null;
  const jobId = job.id;
  return (
    <span className="row-controls">
      <button type="button" aria-label={`Run “${job.name}” now`} onClick={() => controls.ask({ action: 'run-job', args: { jobId } })}>Run now</button>
    </span>
  );
}
