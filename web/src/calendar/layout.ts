// Party Planning Committee calendar layout, all in the viewer's time zone: which days a week or day view shows (weeks
// start on Monday), which local day and hour each run falls in, and the "frequent" lane for jobs that run more than
// FREQUENT_PER_DAY times a day (one summary chip per day instead of dozens). Pure.
import type { CalendarRun, Occurrence, Person } from '@shared/contract';
import { addDays, fromWallTime, startOfDay, wallTime, type CalendarDate } from '@shared/schedule/zone';

export type CalendarMode = 'week' | 'day';
export type Day = { key: string; date: CalendarDate; weekday: number; start: number; end: number };
export type LaneItem = { jobKey: string; count: number; run: CalendarRun; first: Occurrence; nextUp: boolean };
export type Placed = {
  cells: ReadonlyMap<string, readonly Occurrence[]>; // `${dayKey}|${hour}`
  lanes: ReadonlyMap<string, readonly LaneItem[]>; // dayKey
  frequent: ReadonlySet<string>; // job keys
};

export const FREQUENT_PER_DAY = 6;
export const BOT_COLORS = [
  '#2f6fd0', '#e0731e', '#2a9d6f', '#8e5cc2', '#c2477d', '#1b9eb3', '#b58a1b', '#5c6bc0', '#6b8e23', '#d0623f', '#4f7a96', '#9c6644',
] as const;

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: CalendarDate) => `${d.year}-${pad(d.month)}-${pad(d.day)}`;
const weekdayOf = (d: CalendarDate) => new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();

function day(date: CalendarDate, timeZone: string): Day {
  return { key: dayKey(date), date, weekday: weekdayOf(date), start: startOfDay(date, timeZone), end: startOfDay(addDays(date, 1), timeZone) };
}

export function daysFor(mode: CalendarMode, anchor: number, timeZone: string): Day[] {
  const today = wallTime(anchor, timeZone);
  if (mode === 'day') return [day(today, timeZone)];
  const monday = addDays(today, -((today.weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => day(addDays(monday, i), timeZone));
}

/** The anchor a week (or a day) earlier or later, at local noon so DST never tips it into the wrong day. */
export function shiftAnchor(anchor: number, mode: CalendarMode, dir: -1 | 1, timeZone: string): number {
  const date = addDays(wallTime(anchor, timeZone), dir * (mode === 'week' ? 7 : 1));
  return fromWallTime({ ...date, hour: 12, minute: 0 }, timeZone);
}

const RANK: Readonly<Record<CalendarRun, number>> = { failed: 4, missed: 3, ok: 2, unknown: 1, upcoming: 0 };

/** The run a day's summary chip shows: a failure beats a miss beats a success. */
export function laneRun(runs: readonly CalendarRun[]): CalendarRun {
  return runs.reduce<CalendarRun>((best, r) => (RANK[r] > RANK[best] ? r : best), 'upcoming');
}

export function placeRuns(occurrences: readonly Occurrence[], days: readonly Day[], timeZone: string, perDay = FREQUENT_PER_DAY): Placed {
  const shown = new Set(days.map((d) => d.key));
  const located = occurrences.flatMap((o) => {
    const w = wallTime(Date.parse(o.at), timeZone);
    const key = dayKey(w);
    return shown.has(key) ? [{ o, key, hour: w.hour }] : [];
  });
  const perJobDay = located.reduce((m, x) => m.set(`${x.key}|${x.o.jobKey}`, [...(m.get(`${x.key}|${x.o.jobKey}`) ?? []), x.o]), new Map<string, Occurrence[]>());
  const frequent = new Set([...perJobDay.entries()].filter(([, list]) => list.length > perDay).map(([k]) => k.split('|')[1] as string));
  const cells = new Map<string, Occurrence[]>();
  for (const x of located.filter((l) => !frequent.has(l.o.jobKey))) cells.set(`${x.key}|${x.hour}`, [...(cells.get(`${x.key}|${x.hour}`) ?? []), x.o]);
  const lanes = new Map<string, LaneItem[]>();
  for (const [k, list] of perJobDay) {
    const [key = '', jobKey = ''] = k.split('|');
    if (!frequent.has(jobKey) || !list[0]) continue;
    const item: LaneItem = { jobKey, count: list.length, run: laneRun(list.map((o) => o.run)), first: list[0], nextUp: list.some((o) => o.nextUp === true) };
    lanes.set(key, [...(lanes.get(key) ?? []), item]);
  }
  return { cells, lanes, frequent };
}

export function botColors(people: readonly Person[]): Map<string, string> {
  return new Map(people.filter((p) => p.bot).map((p, i) => [p.id, BOT_COLORS[i % BOT_COLORS.length] as string]));
}

const spaces = (s: string) => s.replace(/[   ]/g, ' ');
const noonUtc = (d: CalendarDate) => new Date(Date.UTC(d.year, d.month - 1, d.day, 12));

export function timeLabel(iso: string, timeZone: string, locale?: string): string {
  return spaces(new Intl.DateTimeFormat(locale, { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)));
}

export function hourLabel(hour: number, locale?: string): string {
  return spaces(new Intl.DateTimeFormat(locale, { timeZone: 'UTC', hour: 'numeric' }).format(new Date(Date.UTC(2026, 0, 1, hour))));
}

export function dayLabel(d: Day, locale?: string): { weekday: string; date: string } {
  const at = noonUtc(d.date);
  return {
    weekday: new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short' }).format(at),
    date: new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(at),
  };
}

export function periodLabel(days: readonly Day[], locale?: string): string {
  const first = days[0];
  const last = days.at(-1);
  if (!first || !last) return '';
  if (days.length === 1) {
    return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(noonUtc(first.date));
  }
  const fmt = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  return spaces(fmt.formatRange(noonUtc(first.date), noonUtc(last.date)));
}
