// Words for Conference Room minutes: meeting status, how long it ran, who was present, who said a line. Pure.
import type { Meeting, MeetingStatus, MinutesLine, Person } from '@shared/contract';

export type MeetingFilter = 'all' | Meeting['kind'];

export const MEETING_META: Readonly<Record<MeetingStatus, { word: string; className: string }>> = {
  'in-session': { word: 'In session', className: 'mtg-live' },
  blocked: { word: 'Blocked', className: 'mtg-blocked' },
  scheduled: { word: 'Not started', className: 'mtg-waiting' },
  adjourned: { word: 'Adjourned', className: 'mtg-done' },
};

export function durationText(startIso: string, endIso: string | undefined): string {
  if (!endIso) return 'still in session';
  const mins = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000);
  if (mins < 1) return 'under a minute';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return mins % 60 ? `${h} h ${mins % 60} min` : `${h} h`;
}

const nameOf = (id: string, people: ReadonlyMap<string, Person>) => people.get(id)?.name ?? id;

export function presentText(m: Meeting, people: ReadonlyMap<string, Person>): string {
  if (m.participantIds.length === 0) return 'Nobody on record';
  const role = m.kind === 'council' ? 'chair' : 'owner';
  return m.participantIds.map((id, i) => (i === 0 ? `${nameOf(id, people)} (${role})` : nameOf(id, people))).join(', ');
}

export function lineWho(l: MinutesLine, people: ReadonlyMap<string, Person>): string {
  if (l.personId) return nameOf(l.personId, people);
  return l.author ?? '';
}

export function filterMeetings(list: readonly Meeting[], filter: MeetingFilter): Meeting[] {
  return filter === 'all' ? [...list] : list.filter((m) => m.kind === filter);
}

/** The memo's opening line: when it was called to order and how it stands. */
export function proceedingsText(m: Meeting, clock: (iso: string) => string): string {
  const start = clock(m.startedAt);
  if (m.status === 'scheduled') return `Card opened ${start}; not started yet.`;
  if (m.status === 'adjourned' && m.endedAt) return `Called to order ${start}, adjourned ${clock(m.endedAt)} (${durationText(m.startedAt, m.endedAt)}).`;
  return m.status === 'blocked' ? `Called to order ${start}; blocked, waiting on someone.` : `Called to order ${start}; still in session.`;
}
