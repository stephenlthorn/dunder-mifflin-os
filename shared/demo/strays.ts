// The demo day's strays: open cards that nobody on the demo roster owns and that sit in no room, like a card whose
// assignee was a profile that has since been deleted. The office lists them in Creed's corner. Fictional, like the
// rest of the day.
import type { Task } from '../contract';
import { isoAt, hm } from './time';

export type Stray = { readonly key: string; readonly title: string; readonly status: Task['status']; readonly at: number };
export type StrayCard = { readonly key: string; readonly title: string; readonly status: Task['status']; readonly updatedAt: string };

export const STRAYS: ReadonlyArray<Stray> = Object.freeze([
  { key: 'nashua', title: "Match the Nashua branch's paper prices", status: 'doing', at: hm('08:30') },
  { key: 'shred', title: 'Shred the 2004 expense reports', status: 'blocked', at: hm('09:40') },
  { key: 'scrape', title: "Scrape a competitor's price list", status: 'todo', at: hm('10:45') },
].map((s) => Object.freeze(s as Stray)));

/** The stray cards on the board at an office minute. */
export function straysAt(minute: number): ReadonlyArray<StrayCard> {
  return STRAYS.filter((s) => s.at <= minute).map((s) => ({ key: s.key, title: s.title, status: s.status, updatedAt: isoAt(s.at) }));
}
