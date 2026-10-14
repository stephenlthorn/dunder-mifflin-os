// Wall-clock time in an IANA time zone <-> instants, with the platform's Intl time-zone data. Pure.
// Local times that don't exist (spring forward) resolve to the moment right after the gap, and local times that
// happen twice (fall back) to the first of the two: the same rule as Temporal's 'compatible' disambiguation.

export type CalendarDate = { readonly year: number; readonly month: number; readonly day: number }; // month 1-12
export type WallClock = CalendarDate & { readonly hour: number; readonly minute: number };
export type Wall = WallClock & { readonly weekday: number }; // Sunday = 0

const DAY_MS = 86_400_000;
const WEEKDAYS: Readonly<Record<string, number>> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  const made = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  });
  formatters.set(timeZone, made);
  return made;
}

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
  try {
    formatter(value);
    return true;
  } catch {
    return false;
  }
}

function fields(ms: number, timeZone: string): Wall & { second: number } {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour) % 24, minute: Number(parts.minute), second: Number(parts.second), weekday: WEEKDAYS[parts.weekday ?? ''] ?? 0,
  };
}

export function wallTime(ms: number, timeZone: string): Wall {
  const { second: _second, ...wall } = fields(ms, timeZone);
  return wall;
}

/** The zone's offset from UTC at an instant, in ms (New York in summer: -4 h). */
export function offsetMs(ms: number, timeZone: string): number {
  const f = fields(ms, timeZone);
  const whole = ms - (((ms % 1000) + 1000) % 1000);
  return Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second) - whole;
}

const sameClock = (a: WallClock, b: WallClock) =>
  a.year === b.year && a.month === b.month && a.day === b.day && a.hour === b.hour && a.minute === b.minute;

/** The instant a local wall-clock time names in a zone (see the gap/overlap rule above). */
export function fromWallTime(w: WallClock, timeZone: string): number {
  const local = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  const before = offsetMs(local - DAY_MS, timeZone);
  const after = offsetMs(local + DAY_MS, timeZone);
  const candidates = [...new Set([local - before, local - after])].filter((t) => sameClock(wallTime(t, timeZone), w)).sort((a, b) => a - b);
  return candidates[0] ?? local - before;
}

/** A zone's offset is the same all day on most dates; this says so cheaply (one Intl call per side). */
export function steadyOffset(date: CalendarDate, timeZone: string): number | null {
  const noon = Date.UTC(date.year, date.month - 1, date.day, 12);
  const before = offsetMs(noon - DAY_MS, timeZone);
  return before === offsetMs(noon + DAY_MS, timeZone) ? before : null;
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Local midnight of a date in a zone, as an instant. */
export function startOfDay(date: CalendarDate, timeZone: string): number {
  return fromWallTime({ ...date, hour: 0, minute: 0 }, timeZone);
}

/** The platform's own zone (the server's, or the browser's), falling back to UTC. */
export function localTimeZone(): string {
  const tz = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isTimeZone(tz) ? tz : 'UTC';
}
