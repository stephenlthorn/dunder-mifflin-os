// The demo day's calendar: one fictional Thursday at the branch, 08:30 to 17:30 office time. Office time is UTC, so
// every viewer and every screenshot sees the same clock whatever their time zone. Minutes count from midnight.
// Pure; shared by the server's `demo` adapter and the static (server-less) demo in the browser.

export const DEMO_TITLE = 'Threat Level Midnight';
/** The day the demo replays (the date of the show's pilot, a Thursday). Only office time is ever shown. */
export const DEMO_DATE = '2005-03-24';
export const DEMO_SPEEDS = Object.freeze([1, 10, 60] as const);
export type DemoSpeed = (typeof DEMO_SPEEDS)[number];
export const DEFAULT_SPEED: DemoSpeed = 60;
export const DEFAULT_SEED = 1;

const HM = /^(\d{1,2}):(\d{2})$/;
const MIDNIGHT_MS = Date.parse(`${DEMO_DATE}T00:00:00.000Z`);
const MAX_SEED = 2 ** 31 - 1;

/** '09:15' -> 555. For trusted script data; throws on a typo so a bad script fails its tests. */
export function hm(text: string): number {
  const m = HM.exec(text);
  const minute = m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
  if (!m || Number(m[2]) > 59 || minute >= 24 * 60) throw new Error(`bad office time "${text}"`);
  return minute;
}

export const DAY_START = hm('08:30');
export const DAY_END = hm('17:30');
export const DAY_MINUTES = DAY_END - DAY_START;
export const DEFAULT_START = hm('08:55');

export const formatHm = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(Math.floor(minute % 60)).padStart(2, '0')}`;

/** ISO timestamp of an office minute; dayOffset -1 = the day before (yesterday's job runs), +1 = the day after. */
export function isoAt(minute: number, dayOffset = 0): string {
  return new Date(MIDNIGHT_MS + (dayOffset * 24 * 60 + minute) * 60_000).toISOString();
}

/** A demo speed from config, env, a query string or a request body: 1, 10 or 60, else null. */
export function parseSpeed(raw: unknown): DemoSpeed | null {
  const value = typeof raw === 'string' && /^\s*\d+\s*$/.test(raw) ? Number(raw) : raw;
  return (DEMO_SPEEDS as ReadonlyArray<unknown>).includes(value) ? (value as DemoSpeed) : null;
}

/** 'HH:MM' inside the office day (08:30 to 17:29), else null. */
export function parseClockTime(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = HM.exec(raw.trim());
  if (!m || Number(m[2]) > 59) return null;
  const minute = Number(m[1]) * 60 + Number(m[2]);
  return minute >= DAY_START && minute < DAY_END ? minute : null;
}

/** A whole number from 0 to 2^31-1, else null. */
export function parseSeed(raw: unknown): number | null {
  const value = typeof raw === 'string' && /^\s*\d+\s*$/.test(raw) ? Number(raw) : raw;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_SEED ? value : null;
}
