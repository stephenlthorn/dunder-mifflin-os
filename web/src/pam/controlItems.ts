// Ask Pam's control verbs: pause / resume a bot, stop a running card or run, run a job now, reassign a card.
// Choosing one opens the bot's window with the verb's confirmation step; nothing runs from the palette itself.
// Only with writes on and only what the bot's adapter declares (office/controls.ts).
import type { OfficeSnapshot, Person } from '@shared/contract';
import type { ControlRequest } from '@shared/controls';
import { offeredControls, openTasks, runningTasks, stopsCardsOnly } from '../office/controls';
import { shortName } from '../office/names';
import type { PamItem } from './items';

const VERBS = 'control pause stop run reassign hand over';

function item(p: Person, id: string, label: string, detail: string, request: ControlRequest, extra = ''): PamItem {
  return {
    id: `control:${p.id}:${id}`, kind: 'control', label, detail, personId: p.id,
    fields: [[label, 1], [p.name, 0.7], [p.bot?.profile ?? '', 0.5], [`${VERBS} ${extra}`, 0.4]],
    action: { type: 'control', personId: p.id, request }, alt: { type: 'show-person', personId: p.id },
  };
}

function itemsFor(s: OfficeSnapshot, p: Person, writable: boolean): PamItem[] {
  const offered = offeredControls(p, writable);
  const first = shortName(p.name);
  const profile = p.bot?.profile ?? '';
  const cardsOnly = stopsCardsOnly(p);
  const pause = offered.pause
    ? [item(p, 'pause', `Pause ${first}`, `${profile} · send them home`, { action: 'pause' }),
      item(p, 'resume', `Resume ${first}`, `${profile} · back to work`, { action: 'resume' })]
    : [];
  const stopRun = offered.stop && !cardsOnly ? [item(p, 'stop', `Stop ${first}’s current run`, profile, { action: 'stop' })] : [];
  const cards = openTasks(p, s).flatMap((t) => [
    ...(offered.stop && runningTasks(p, s).includes(t)
      ? [item(p, `stop:${t.id}`, `Stop “${t.title}”`, `${first} · running card`, { action: 'stop', args: { taskId: t.id } }, 'card task')] : []),
    ...(offered.reassign
      ? [item(p, `reassign:${t.id}`, `Reassign “${t.title}”…`, `${first} · hand the card to another bot`, { action: 'reassign', args: { taskId: t.id, to: '' } }, 'card task')] : []),
  ]);
  const jobs = offered.runJob
    ? (s.jobs?.[p.id] ?? []).flatMap((j) => (j.id && j.enabled
      ? [item(p, `job:${j.id}`, `Run “${j.name}” now`, `${first} · ${j.schedule}`, { action: 'run-job', args: { jobId: j.id } }, 'job cron now')] : []))
    : [];
  return [...pause, ...stopRun, ...cards, ...jobs];
}

export function controlItems(s: OfficeSnapshot, writable: boolean): PamItem[] {
  return writable ? s.people.flatMap((p) => (p.bot ? itemsFor(s, p, writable) : [])) : [];
}
