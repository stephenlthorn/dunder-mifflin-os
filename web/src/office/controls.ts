// Control verbs in the browser: which ones a bot offers (its adapter's flags, writes on), who can take over one of its
// cards, and what the confirmation step says before anything is sent. Pure functions over contract data.
import type { OfficeSnapshot, Person, Task } from '@shared/contract';
import type { ControlRequest } from '@shared/controls';
import { shortName } from './names';

export type OfferedControls = { pause: boolean; stop: boolean; runJob: boolean; reassign: boolean };
export type ConfirmCopy = { title: string; detail: string; confirm: string; tone: 'danger' | 'normal' };

const NONE: OfferedControls = { pause: false, stop: false, runJob: false, reassign: false };
const adapterOf = (p: Person) => p.bot?.adapter ?? 'hermes';

/** What the person window and Ask Pam may offer. Data that predates control verbs carries no flags: nothing. */
export function offeredControls(person: Person, writable: boolean): OfferedControls {
  const caps = person.bot?.capabilities;
  if (!writable || !caps) return NONE;
  return { pause: caps.pause, stop: caps.stop, runJob: caps.runJob === true, reassign: caps.reassign === true };
}

/** Other bots of the same adapter (a card can't move between agent systems). */
export function reassignTargets(person: Person, s: OfficeSnapshot): Person[] {
  return s.people.filter((p) => p.id !== person.id && p.bot && adapterOf(p) === adapterOf(person));
}

/** Hermes and the demo day stop kanban cards only (nothing else of theirs runs that the office can stop). */
export const stopsCardsOnly = (p: Person): boolean => ['hermes', 'demo'].includes(adapterOf(p));

export const runningTasks = (person: Person, s: OfficeSnapshot): Task[] => s.tasks.filter((t) => t.ownerId === person.id && t.status === 'doing');
export const openTasks = (person: Person, s: OfficeSnapshot): Task[] => s.tasks.filter((t) => t.ownerId === person.id && t.status !== 'done');

const STOP_DETAIL: Readonly<Record<string, string>> = {
  hermes: 'Its worker ends now and the card is parked as blocked, so Hermes does not start it again. Unblock it in HR · Approvals to run it again.',
  'claude-code': 'Claude Code ends its turn at its next step that runs a tool (hooks cannot cut a reply short).',
  demo: 'The card stops and stays parked as blocked for the rest of the demo day.',
};

export function confirmCopy(req: ControlRequest, ctx: { person: Person; snapshot: OfficeSnapshot }): ConfirmCopy {
  const first = shortName(ctx.person.name);
  const task = (id: string) => ctx.snapshot.tasks.find((t) => t.id === id);
  const stopDetail = STOP_DETAIL[adapterOf(ctx.person)] ?? `The office asks ${first} to stop its current run.`;
  switch (req.action) {
    case 'pause':
      return { title: `Pause ${first}?`, detail: `${first} goes home: no new work until you resume them. The office tells the agent; work in flight may finish.`, confirm: 'Pause', tone: 'danger' };
    case 'resume':
      return { title: `Resume ${first}?`, detail: `${first} comes back to their desk and takes work again.`, confirm: 'Resume', tone: 'normal' };
    case 'stop': {
      const t = req.args ? task(req.args.taskId) : undefined;
      return { title: t ? `Stop “${t.title}”?` : `Stop ${first}’s current run?`, detail: stopDetail, confirm: 'Stop it', tone: 'danger' };
    }
    case 'run-job': {
      const job = ctx.snapshot.jobs?.[ctx.person.id]?.find((j) => j.id === req.args.jobId);
      const name = job?.name ?? 'this job';
      return { title: `Run “${name}” now?`, detail: `It runs once now, outside its schedule${job ? ` (${job.schedule})` : ''}, and shows on ${first}’s timeline.`, confirm: 'Run now', tone: 'normal' };
    }
    case 'reassign': {
      const title = task(req.args.taskId)?.title ?? 'this card';
      const to = ctx.snapshot.people.find((p) => p.id === req.args.to);
      return {
        title: to ? `Hand “${title}” to ${shortName(to.name)}?` : `Hand “${title}” to…`,
        detail: 'If it is running, its current run stops first; the new owner picks it up from the board.', confirm: 'Reassign', tone: 'normal',
      };
    }
  }
}
