// Fleet filters ("show only working / needs-you / errors"): who matches, who the map dims, and counts. Pure.
import type { OfficeSnapshot, Person, Presence } from '@shared/contract';
import { presenceFor } from './status';

export type FleetFilter = 'all' | 'working' | 'needs-you' | 'error';
export type ActiveFilter = Exclude<FleetFilter, 'all'>;

export const FILTERS: readonly ActiveFilter[] = ['working', 'needs-you', 'error'];
export const FILTER_META: Record<FleetFilter, { label: string; only: string }> = {
  all: { label: 'Everyone', only: 'Showing everyone' },
  working: { label: 'Working', only: 'Showing only working bots' },
  'needs-you': { label: 'Needs you', only: 'Showing only bots that need you' },
  error: { label: 'Errors', only: 'Showing only bots with errors' },
};

/** Waiting on you: the adapters' canonical `needs-input` status. */
export const needsYou = (p: Presence): boolean => p.status === 'needs-input';

export function matchesFilter(person: Person, presence: Presence, filter: FleetFilter): boolean {
  if (filter === 'all') return true;
  if (!person.bot) return false;
  if (filter === 'needs-you') return needsYou(presence);
  return presence.status === filter;
}

/** People a filter hides (the map dims them, the list leaves them out). Empty for "all". */
export function hiddenByFilter(s: OfficeSnapshot, filter: FleetFilter): ReadonlySet<string> {
  if (filter === 'all') return new Set();
  return new Set(s.people.filter((p) => !matchesFilter(p, presenceFor(p, s.presence), filter)).map((p) => p.id));
}

export function filterCounts(s: OfficeSnapshot): Record<ActiveFilter, number> {
  const count = (f: ActiveFilter) => s.people.filter((p) => matchesFilter(p, presenceFor(p, s.presence), f)).length;
  return { working: count('working'), 'needs-you': count('needs-you'), error: count('error') };
}
