// One bot's week in numbers: cards done, errors, activity, how long blocked cards waited and the longest card.
// Pure; folded events (a `count`) count as that many.
import type { TimelineEvent } from '@shared/observability';
import type { BotWeek, Window } from './signals';

export type Tally = {
  cards: number; // cards finished
  started: number;
  errors: number; // errors + failed job runs (+ one for an error right now that the timeline hasn't caught)
  lastError?: string;
  tools: number;
  replies: number;
  runs: number; // scheduled job runs, ok or failed
  other: number; // activity reports
  turnarounds: number[]; // ms from a card blocking (waiting on you) to it moving again, ascending
  longest?: { title: string; ms: number; open: boolean };
};

const n = (e: TimelineEvent) => e.count ?? 1;
const at = (e: TimelineEvent) => Date.parse(e.at);
const sum = (events: readonly TimelineEvent[], kinds: readonly string[]) => events.filter((e) => kinds.includes(e.kind)).reduce((acc, e) => acc + n(e), 0);
const errorText = (e: TimelineEvent) => (e.kind === 'cron.fail' && e.detail ? `${e.title}: ${e.detail}` : e.title);

/** From each block to the next start or finish of the same card. */
function turnarounds(events: readonly TimelineEvent[]): number[] {
  return events.filter((e) => e.kind === 'task.blocked').flatMap((b) => {
    const next = events.filter((e) => (e.kind === 'task.started' || e.kind === 'task.finished') && e.title === b.title && at(e) > at(b))
      .reduce<TimelineEvent | undefined>((best, e) => (!best || at(e) < at(best) ? e : best), undefined);
    return next ? [at(next) - at(b)] : [];
  }).sort((a, b) => a - b);
}

/** The longest card: each finish against the latest start of the same card before it; a start never finished runs to now. */
function longest(events: readonly TimelineEvent[], to: number): Tally['longest'] {
  const starts = events.filter((e) => e.kind === 'task.started');
  const finishes = events.filter((e) => e.kind === 'task.finished');
  const done = finishes.flatMap((f) => {
    const start = starts.filter((s) => s.title === f.title && at(s) < at(f)).reduce<TimelineEvent | undefined>((best, s) => (!best || at(s) > at(best) ? s : best), undefined);
    return start ? [{ title: f.title, ms: at(f) - at(start), open: false }] : [];
  });
  const open = starts.filter((s) => !finishes.some((f) => f.title === s.title && at(f) > at(s))).map((s) => ({ title: s.title, ms: to - at(s), open: true }));
  return [...done, ...open].reduce<Tally['longest']>((best, c) => (!best || c.ms > best.ms ? c : best), undefined);
}

export function tally(bot: BotWeek, w: Window): Tally {
  const events = bot.events.filter((e) => at(e) >= w.from && at(e) <= w.to);
  const errorEvents = events.filter((e) => e.kind === 'error' || e.kind === 'cron.fail');
  const latest = errorEvents.reduce<TimelineEvent | undefined>((best, e) => (!best || at(e) > at(best) ? e : best), undefined);
  const counted = errorEvents.reduce((acc, e) => acc + n(e), 0);
  const nowOnly = bot.errorNow !== undefined && counted === 0;
  const lastError = latest ? errorText(latest) : bot.errorNow;
  const long = longest(events, w.to);
  return {
    cards: sum(events, ['task.finished']), started: sum(events, ['task.started']),
    errors: counted + (nowOnly ? 1 : 0), ...(lastError ? { lastError } : {}),
    tools: sum(events, ['tool.call']), replies: sum(events, ['message.out']), runs: sum(events, ['cron.ok', 'cron.fail']), other: sum(events, ['activity']),
    turnarounds: turnarounds(events), ...(long ? { longest: long } : {}),
  };
}

/** Everything a bot did that counts as work. */
export const activityOf = (t: Tally) => t.cards + t.started + t.tools + t.replies + t.runs + t.other;
