// The Dundies: a weekly digest of awards, each won on real numbers from the bots' own records (timeline, cards,
// scheduled jobs, the ledger). Every award has a neutral name for Toby mode, and its reason is the number that won
// it. Deterministic: ties go to the busier bot, then the earlier name. Never fed back into routing (Goodhart).
import { type Tally, activityOf, tally } from './tally';
import type { BotWeek, Window } from './signals';

export { tally } from './tally';

export type DundieId = 'hottest' | 'busiest' | 'unbroken' | 'fine-work' | 'longest' | 'tight' | 'dont-go-in';
export type Dundie = { id: DundieId; title: string; neutral: string; winnerId: string; winner: string; reason: string; trophy: boolean };
export type Digest = { from: string; to: string; awards: Dundie[]; counted: number; fromSnapshot: number };

type Entry = { bot: BotWeek; t: Tally; activity: number };
type Spec = {
  id: DundieId; title: string; neutral: string; trophy: boolean; lower?: boolean;
  eligible: (e: Entry) => boolean; value: (e: Entry) => number; reason: (e: Entry) => string;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const usd = (x: number) => (x < 0.01 ? 'under $0.01' : `$${x.toFixed(2)}`);
const work = (t: Tally) => t.runs + t.cards + t.replies;
const median = (xs: readonly number[]) => {
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
};

export function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return 'under a minute';
  if (mins < 60) return `${mins} min`;
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days) return hours ? `${days} d ${hours} h` : `${days} d`;
  return mins % 60 ? `${hours} h ${mins % 60} min` : `${hours} h`;
}

function busyReason(t: Tally): string {
  const parts: [number, string][] = [
    [t.tools, plural(t.tools, 'tool call')], [t.cards, plural(t.cards, 'card')], [t.replies, plural(t.replies, 'reply', 'replies')],
    [t.runs, plural(t.runs, 'job run')], [t.other, plural(t.other, 'update')],
  ];
  return parts.filter(([n]) => n > 0).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, text]) => text).join(' · ');
}

const SPECS: readonly Spec[] = [
  { id: 'hottest', title: 'Hottest in the Office', neutral: 'Most cards done', trophy: true,
    eligible: (e) => e.t.cards > 0, value: (e) => e.t.cards, reason: (e) => `${plural(e.t.cards, 'card')} done` },
  { id: 'busiest', title: 'Busiest Beaver', neutral: 'Most active', trophy: true,
    eligible: (e) => e.activity > 0, value: (e) => e.activity, reason: (e) => busyReason(e.t) },
  { id: 'unbroken', title: 'Best Dundie for Not Breaking Anything', neutral: 'Zero errors', trophy: true,
    eligible: (e) => e.t.errors === 0 && work(e.t) > 0, value: (e) => work(e.t), reason: (e) => `0 errors in ${work(e.t)} runs, cards and replies` },
  { id: 'fine-work', title: 'Fine Work', neutral: 'Fastest approval turnaround', trophy: true, lower: true,
    eligible: (e) => e.t.turnarounds.length > 0, value: (e) => median(e.t.turnarounds),
    reason: (e) => (e.t.turnarounds.length === 1 ? `approval turned around in ${formatDuration(e.t.turnarounds[0]!)}`
      : `approvals turned around in ${formatDuration(median(e.t.turnarounds))} (median of ${e.t.turnarounds.length})`) },
  { id: 'longest', title: 'Longest Engagement', neutral: 'Longest-running card', trophy: true,
    eligible: (e) => e.t.longest !== undefined, value: (e) => e.t.longest?.ms ?? 0,
    reason: (e) => `“${e.t.longest!.title}” ${e.t.longest!.open ? 'has run' : 'ran'} ${formatDuration(e.t.longest!.ms)}${e.t.longest!.open ? ' and counting' : ''}` },
  { id: 'tight', title: 'Tight-Ass Award', neutral: 'Lowest cost per card', trophy: true, lower: true,
    eligible: (e) => e.t.cards > 0 && typeof e.bot.cost === 'number' && e.bot.cost > 0, value: (e) => (e.bot.cost as number) / e.t.cards,
    reason: (e) => `${usd((e.bot.cost as number) / e.t.cards)} a card (${usd(e.bot.cost as number)} for ${plural(e.t.cards, 'card')})` },
  { id: 'dont-go-in', title: 'Don’t Go in There After Me', neutral: 'Most errors', trophy: false,
    eligible: (e) => e.t.errors > 0, value: (e) => e.t.errors, reason: (e) => `${plural(e.t.errors, 'error')}; last: ${e.t.lastError ?? 'unknown'}` },
];

function winner(spec: Spec, entries: readonly Entry[]): Entry | undefined {
  const sign = spec.lower ? 1 : -1;
  return entries.filter(spec.eligible).sort((a, b) => sign * (spec.value(a) - spec.value(b)) || b.activity - a.activity
    || a.bot.name.localeCompare(b.bot.name, 'en') || (a.bot.personId < b.bot.personId ? -1 : 1))[0];
}

export function computeDundies(bots: readonly BotWeek[], w: Window): Digest {
  const entries = bots.map((bot): Entry => {
    const t = tally(bot, w);
    return { bot, t, activity: activityOf(t) };
  });
  const awards = SPECS.flatMap((spec): Dundie[] => {
    const e = winner(spec, entries);
    return e ? [{ id: spec.id, title: spec.title, neutral: spec.neutral, winnerId: e.bot.personId, winner: e.bot.name, reason: spec.reason(e), trophy: spec.trophy }] : [];
  });
  return {
    from: new Date(w.from).toISOString(), to: new Date(w.to).toISOString(), awards,
    counted: bots.length, fromSnapshot: bots.filter((b) => b.source === 'snapshot').length,
  };
}

/** Who keeps a trophy on their desk this week, and for what. */
export function trophyShelf(d: Digest | null): ReadonlyMap<string, readonly Dundie[]> {
  return (d?.awards ?? []).filter((a) => a.trophy).reduce((m, a) => new Map([...m, [a.winnerId, [...(m.get(a.winnerId) ?? []), a]]]), new Map<string, Dundie[]>());
}
