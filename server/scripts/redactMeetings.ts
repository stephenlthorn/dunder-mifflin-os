// Scrubs live meeting records (kanban.db, read-only) into fixture data: keeps structure, statuses, kinds and
// timestamps; replaces every id, title, comment, summary and block reason with synthetic text. Council round titles
// that are pure process ("Council 2026-10-08: round 2 cfo", "...: chair", "...: minutes") are kept as they are.
import type { KanbanTask } from '../src/hermes/types.ts';
import type { MeetingRecords } from '../src/hermes/meetingTypes.ts';
import { isBotProfile } from '../src/roster.ts';
import type { Remap } from './redact.ts';

const TITLES = [
  'Restock the conference room paper', 'Reconcile the Q4 paper invoices', 'Plan the Dundies agenda', 'Order toner for the copier',
  'Draft the client follow-up', 'Audit the warehouse inventory', 'Update the price sheet', 'Write the safety training memo',
  'Fix the conference room TV', 'Call back the Scranton prospects', 'Refresh the website banner', 'Review the expense reports',
];
const ACTIONS = [
  'draft the paper price letter', 'call the three biggest clients', 'clean up the client list', 'book the warehouse safety drill',
  'write the Dundies recap', 'fix the fax-to-email bridge', 'recut the sales video', 'audit the toner spend',
];
const COMMENTS = [
  'On it. Results by end of day.', 'Blocked on the client list; asking Pam.', 'Done. Notes are on the card.', 'Moved this to tomorrow.',
  'Two numbers disagree; checking with Accounting.', 'Looks good to me.', 'Needs a second pair of eyes.', 'Handing this to the warehouse.',
];
const SUMMARIES = [
  'Recommended a 3% price rise for Q4, with a review in January.', 'Wrote the follow-up and filed it on the card.',
  'Checked the numbers: margins hold at 3%, not 5%.', 'Drafted the agenda: five awards, one speech, no limbo.',
  'Found two duplicate invoices and flagged them.', 'Booked the drill for Thursday; the warehouse agreed.',
  'Ran the audit: toner spend is down 12% on last quarter.', 'Summarised the round for the chair.',
];
const REASONS = ['Waiting for the client list', 'Needs approval from the chair', 'The copier is jammed again', 'Missing the Q4 numbers'];
const KEPT_CREATORS = new Set(['council', 'user', 'worker']);
const PROCESS_TITLE = /^Council \d{4}-\d{2}-\d{2}: (round \d+ [a-z-]+|chair|minutes)( \(retry\))?$/;

const bot = (p: string | null): string | null => (p && isBotProfile(p) ? p : null);
const pick = (list: ReadonlyArray<string>, i: number): string => list[i % list.length] as string;

function title(t: KanbanTask, i: number): string {
  if (t.createdBy !== 'council') return pick(TITLES, i);
  if (PROCESS_TITLE.test(t.title)) return t.title;
  const date = /^Council (\d{4}-\d{2}-\d{2})/.exec(t.title)?.[1];
  return date ? `Council ${date}: ${pick(ACTIONS, i)}` : `Council session: ${pick(ACTIONS, i)}`;
}

export function redactMeetings(r: MeetingRecords, chat: Remap): MeetingRecords {
  const ids = new Map(r.tasks.map((t, i) => [t.id, `t_mtg${String(i + 1).padStart(3, '0')}`]));
  const id = (taskId: string) => ids.get(taskId) ?? 't_mtg_old';
  const author = (a: string) => (isBotProfile(a) || a === 'user' ? a : 'worker');
  return {
    tasks: r.tasks.map((t, i) => ({
      ...t, id: id(t.id), title: title(t, i), assignee: bot(t.assignee), tenant: null,
      createdBy: t.createdBy && (KEPT_CREATORS.has(t.createdBy) || t.createdBy.startsWith('dmos-') || isBotProfile(t.createdBy)) ? t.createdBy : 'user',
    })),
    runs: r.runs.map((x, i) => ({ ...x, taskId: id(x.taskId), profile: bot(x.profile), summary: x.summary ? pick(SUMMARIES, i) : null })),
    subs: r.subs.map((s) => ({ ...s, taskId: id(s.taskId), chatKey: chat(s.chatKey), notifierProfile: bot(s.notifierProfile) })),
    links: r.links.map((l) => ({ parentId: id(l.parentId), childId: id(l.childId), parentAssignee: bot(l.parentAssignee), childAssignee: bot(l.childAssignee) })),
    comments: r.comments.map((c, i) => ({ ...c, taskId: id(c.taskId), author: author(c.author), body: pick(COMMENTS, i) })),
    events: r.events.map((e, i) => ({ ...e, taskId: id(e.taskId), profile: bot(e.profile), reason: e.reason ? pick(REASONS, i) : null })),
  };
}
