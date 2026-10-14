// Query validation and time windows for the timeline and usage endpoints. 'today' starts at the server's local
// midnight (the same clock the agents' logs use); 7d and 30d are rolling windows ending now.
import {
  TIMELINE_DEFAULT_LIMIT, TIMELINE_MAX_DAYS, TIMELINE_MAX_LIMIT, USAGE_PERIODS, type UsagePeriod,
} from '../../../shared/observability.ts';
import type { UsageWindow } from '../adapters/types.ts';

const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})$/;

export function usageWindow(period: UsagePeriod, nowMs: number): UsageWindow {
  const to = new Date(nowMs).toISOString();
  if (period === 'today') {
    const midnight = new Date(nowMs);
    midnight.setHours(0, 0, 0, 0);
    return { from: midnight.toISOString(), to };
  }
  const days = period === '7d' ? 7 : 30;
  return { from: new Date(nowMs - days * DAY_MS).toISOString(), to };
}

export function parsePeriod(raw: string | null): { ok: true; period: UsagePeriod } | { ok: false; error: string } {
  if (raw === null || raw === '') return { ok: true, period: 'today' };
  return (USAGE_PERIODS as ReadonlyArray<string>).includes(raw)
    ? { ok: true, period: raw as UsagePeriod }
    : { ok: false, error: `period must be one of ${USAGE_PERIODS.join(', ')}` };
}

export type TimelineParams = { ok: true; since: string; limit: number } | { ok: false; error: string };

export function timelineSince(rawSince: string | null, rawLimit: string | null, nowMs: number): TimelineParams {
  let limit = TIMELINE_DEFAULT_LIMIT;
  if (rawLimit !== null && rawLimit !== '') {
    if (!/^\d{1,7}$/.test(rawLimit) || Number(rawLimit) < 1) return { ok: false, error: 'limit must be a whole number from 1' };
    limit = Math.min(TIMELINE_MAX_LIMIT, Number(rawLimit));
  }
  const earliest = nowMs - TIMELINE_MAX_DAYS * DAY_MS;
  if (rawSince === null || rawSince === '') return { ok: true, since: new Date(nowMs - DAY_MS).toISOString(), limit };
  const ms = ISO.test(rawSince) ? Date.parse(rawSince) : Number.NaN;
  if (!Number.isFinite(ms)) return { ok: false, error: 'since must be an ISO 8601 time like 2026-10-13T00:00:00Z' };
  const clamped = Math.min(nowMs, Math.max(earliest, ms));
  return { ok: true, since: clamped === ms ? rawSince : new Date(clamped).toISOString(), limit };
}
