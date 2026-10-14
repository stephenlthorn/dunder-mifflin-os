// Schedule rules -> run instants inside a span. Pure. Cron runs in the job's IANA zone (DST rule: see zone.ts),
// intervals step from an anchor run, one-offs are a single instant. Every expansion is capped by `limit`.
import type { ScheduleRule } from '../contract';
import { matchesDay, parseCron, type CronSpec } from './cron';
import { addDays, fromWallTime, steadyOffset, wallTime, type CalendarDate } from './zone';

export type Span = { readonly from: number; readonly to: number }; // epoch ms, [from, to)
export type Expansion = { readonly times: ReadonlyArray<number>; readonly truncated: boolean };

const MINUTE_MS = 60_000;
const NONE: Expansion = Object.freeze({ times: Object.freeze([]), truncated: false });
const after = (a: CalendarDate, b: CalendarDate) => a.year !== b.year ? a.year > b.year : a.month !== b.month ? a.month > b.month : a.day > b.day;

/** Cron runs in [from, to), oldest first, at most `limit`. */
export function cronTimes(spec: CronSpec, timeZone: string, span: Span, limit: number): Expansion {
  if (!(span.to > span.from) || limit < 1) return NONE;
  const seen = new Set<number>();
  const last = wallTime(span.to - 1, timeZone);
  for (let date: CalendarDate = wallTime(span.from, timeZone); !after(date, last); date = addDays(date, 1)) {
    if (!matchesDay(spec, date.year, date.month, date.day)) continue;
    const offset = steadyOffset(date, timeZone);
    for (const hour of spec.hours) {
      for (const minute of spec.minutes) {
        const t = offset === null
          ? fromWallTime({ ...date, hour, minute }, timeZone)
          : Date.UTC(date.year, date.month - 1, date.day, hour, minute) - offset;
        if (t < span.from || t >= span.to || seen.has(t)) continue;
        if (seen.size >= limit) return { times: [...seen].sort((a, b) => a - b), truncated: true };
        seen.add(t);
      }
    }
  }
  return { times: [...seen].sort((a, b) => a - b), truncated: false };
}

/** Every `minutes` from `anchor` (a known run), forwards and backwards, inside the span. */
export function intervalTimes(minutes: number, anchor: number, span: Span, limit: number): Expansion {
  const step = minutes * MINUTE_MS;
  if (!Number.isFinite(step) || step < MINUTE_MS || !Number.isFinite(anchor) || !(span.to > span.from)) return NONE;
  const first = Math.ceil((span.from - anchor) / step);
  const lastK = Math.ceil((span.to - anchor) / step) - 1;
  const count = Math.max(0, lastK - first + 1);
  const times = Array.from({ length: Math.min(count, limit) }, (_, i) => anchor + (first + i) * step);
  return { times, truncated: count > limit };
}

/** A one-off run: an ISO instant, or a local time without an offset in the job's zone. */
export function onceTime(at: string, timeZone: string): number | null {
  const local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(at.trim());
  if (local) {
    const [year, month, day, hour, minute] = local.slice(1).map(Number) as [number, number, number, number, number];
    return fromWallTime({ year, month, day, hour, minute }, timeZone);
  }
  const t = Date.parse(at);
  return Number.isFinite(t) ? t : null;
}

const INTERVAL = /^every\s+(\d{1,4})\s*(m|min|mins|minutes?|h|hrs?|hours?|d|days?)$/i;
const UNIT_MINUTES: Readonly<Record<string, number>> = { m: 1, h: 60, d: 1440 };
const WORDS: Readonly<Record<string, number>> = { hourly: 60, daily: 1440 };

/** A rule from schedule text: a cron expression, "every 30m" / "every 2 h", "hourly" or "once at 2026-10-06 12:30". */
export function ruleFromText(text: string): ScheduleRule | null {
  const t = text.trim();
  if (parseCron(t).ok) return { kind: 'cron', expr: t };
  const every = INTERVAL.exec(t);
  if (every) {
    const minutes = Number(every[1]) * (UNIT_MINUTES[(every[2] ?? 'm').charAt(0).toLowerCase()] ?? 1);
    return minutes >= 1 ? { kind: 'interval', minutes } : null;
  }
  const word = WORDS[t.toLowerCase()];
  if (word) return { kind: 'interval', minutes: word };
  const once = /^once at (\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/i.exec(t);
  return once ? { kind: 'once', at: `${once[1]}T${once[2]}` } : null;
}
