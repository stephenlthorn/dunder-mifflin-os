// ?from&to query parameters (ISO instants) -> a validated period in epoch ms, [from, to). Either may be left out:
// the endpoint's default applies, measured from now.
export type PeriodRules = {
  readonly backMs: number; // default `from` = now - backMs
  readonly aheadMs: number; // default `to` = now + aheadMs
  readonly maxSpanMs: number;
};
export type PeriodResult = { readonly ok: true; readonly from: number; readonly to: number } | { readonly ok: false; readonly error: string };

const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const EARLIEST = Date.UTC(2000, 0, 1);
const LATEST = Date.UTC(2100, 0, 1);

function instant(params: URLSearchParams, name: string, fallback: number): number | string {
  const raw = params.get(name);
  if (raw === null) return fallback;
  const t = raw.length <= 40 && ISO.test(raw) ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(t) && t >= EARLIEST && t < LATEST ? t : `${name} must be an ISO date-time between 2000 and 2100`;
}

export function parsePeriod(params: URLSearchParams, nowMs: number, rules: PeriodRules): PeriodResult {
  const from = instant(params, 'from', nowMs - rules.backMs);
  if (typeof from === 'string') return { ok: false, error: from };
  const to = instant(params, 'to', nowMs + rules.aheadMs);
  if (typeof to === 'string') return { ok: false, error: to };
  if (to <= from) return { ok: false, error: 'to must be after from' };
  if (to - from > rules.maxSpanMs) return { ok: false, error: `the period can be at most ${Math.round(rules.maxSpanMs / DAY_MS)} days` };
  return { ok: true, from, to };
}

export const SCHEDULE_PERIOD: PeriodRules = Object.freeze({ backMs: DAY_MS, aheadMs: 7 * DAY_MS, maxSpanMs: 42 * DAY_MS });
export const MEETINGS_PERIOD: PeriodRules = Object.freeze({ backMs: 14 * DAY_MS, aheadMs: DAY_MS, maxSpanMs: 92 * DAY_MS });
