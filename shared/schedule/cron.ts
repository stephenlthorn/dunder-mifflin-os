// A minimal 5-field cron parser (minute hour day-of-month month day-of-week). Pure, no dependencies.
// Supports *, numbers, ranges (a-b), steps (*/n, a-b/n, a/n), lists, month and weekday names, day-of-week 7 = Sunday
// and the @hourly/@daily/@midnight/@weekly/@monthly/@yearly/@annually shortcuts.
// Day rule (as in Vixie cron and croniter): when BOTH day-of-month and day-of-week are restricted, a day matches if
// EITHER does; when one of them is exactly `*`, only the other counts.

export type CronSpec = {
  readonly minutes: ReadonlyArray<number>;
  readonly hours: ReadonlyArray<number>;
  readonly daysOfMonth: ReadonlyArray<number>;
  readonly months: ReadonlyArray<number>; // 1-12
  readonly daysOfWeek: ReadonlyArray<number>; // 0-6, Sunday = 0
  readonly anyDayOfMonth: boolean;
  readonly anyDayOfWeek: boolean;
};
export type CronResult = { readonly ok: true; readonly spec: CronSpec } | { readonly ok: false; readonly error: string };

type Field = { readonly name: string; readonly min: number; readonly max: number; readonly names?: ReadonlyArray<string> };

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const FIELDS: ReadonlyArray<Field> = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12, names: MONTHS },
  { name: 'day of week', min: 0, max: 7, names: DAYS },
];
const SHORTCUTS: Readonly<Record<string, string>> = {
  '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *',
};
const MAX_EXPR = 200;

function value(text: string, field: Field): number | null {
  if (/^\d{1,2}$/.test(text)) return Number(text);
  const named = field.names?.indexOf(text.toLowerCase()) ?? -1;
  if (named < 0) return null;
  return field.names === MONTHS ? named + 1 : named;
}

/** One comma-separated part -> its values, or null when it isn't valid for the field. */
function part(text: string, field: Field): number[] | null {
  const pieces = text.split('/');
  if (pieces.length > 2) return null;
  const [base = '', stepText] = pieces;
  const step = stepText === undefined ? 1 : /^\d{1,2}$/.test(stepText) ? Number(stepText) : 0;
  if (step < 1) return null;
  let lo: number | null;
  let hi: number | null;
  if (base === '*') {
    [lo, hi] = [field.min, field.max];
  } else if (base.includes('-')) {
    const ends = base.split('-');
    if (ends.length !== 2) return null;
    [lo, hi] = [value(ends[0] ?? '', field), value(ends[1] ?? '', field)];
  } else {
    lo = value(base, field);
    hi = stepText === undefined ? lo : field.max;
  }
  if (lo === null || hi === null || lo < field.min || hi > field.max || lo > hi) return null;
  return Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
}

function parseField(text: string, field: Field): number[] | null {
  const values: number[] = [];
  for (const p of text.split(',')) {
    const got = part(p, field);
    if (!got) return null;
    values.push(...got);
  }
  const normalised = field.name === 'day of week' ? values.map((v) => v % 7) : values;
  return [...new Set(normalised)].sort((a, b) => a - b);
}

export function parseCron(expr: string): CronResult {
  const trimmed = expr.trim().slice(0, MAX_EXPR);
  if (trimmed.startsWith('@')) {
    const expanded = SHORTCUTS[trimmed.toLowerCase()];
    return expanded ? parseCron(expanded) : { ok: false, error: `${trimmed} is not a calendar schedule` };
  }
  const texts = trimmed.split(/\s+/).filter((t) => t.length > 0);
  if (texts.length !== FIELDS.length) return { ok: false, error: `expected 5 fields (minute hour day month weekday), got ${texts.length}` };
  const parsed: number[][] = [];
  for (const [i, field] of FIELDS.entries()) {
    const values = parseField(texts[i] ?? '', field);
    if (!values) return { ok: false, error: `bad ${field.name} field: ${texts[i]}` };
    parsed.push(values);
  }
  const [minutes = [], hours = [], daysOfMonth = [], months = [], daysOfWeek = []] = parsed;
  return {
    ok: true,
    spec: { minutes, hours, daysOfMonth, months, daysOfWeek, anyDayOfMonth: texts[2] === '*', anyDayOfWeek: texts[4] === '*' },
  };
}

/** Does the cron run at all on this calendar date (month 1-12)? Dates that don't exist (31 Nov) never match. */
export function matchesDay(spec: CronSpec, year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || !spec.months.includes(month)) return false;
  const dom = spec.daysOfMonth.includes(day);
  const dow = spec.daysOfWeek.includes(date.getUTCDay());
  if (spec.anyDayOfMonth) return dow;
  if (spec.anyDayOfWeek) return dom;
  return dom || dow;
}
