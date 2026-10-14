// Validation at the browser's boundary for /api/people/:id/timeline and /api/usage: untrusted until it passes here.
import {
  TIMELINE_KINDS, USAGE_PERIODS, type CostSource, type ModelUsage, type TimelineEvent, type TimelineKind, type TimelineResponse,
  type UsageReport, type UsageRow, type UsageSummary,
} from '@shared/observability';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined);
const count = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): v is T => typeof v === 'string' && (allowed as readonly string[]).includes(v);
const COST_SOURCES: readonly CostSource[] = ['recorded', 'price-table', 'included', 'unpriced'];
const MAX_EVENTS = 1000;
const MAX_ROWS = 200;

function parseEvent(v: unknown): TimelineEvent | null {
  if (!isObj(v) || !str(v.id, 120) || !oneOf<TimelineKind>(v.kind, TIMELINE_KINDS) || typeof v.at !== 'string' || Number.isNaN(Date.parse(v.at))) return null;
  const title = str(v.title, 200);
  if (!title) return null;
  const detail = str(v.detail, 200);
  const source = str(v.source, 40);
  const n = typeof v.count === 'number' && Number.isInteger(v.count) && v.count > 0 ? v.count : undefined;
  return {
    id: str(v.id, 120)!, at: v.at, kind: v.kind, title,
    ...(detail ? { detail } : {}), ...(source ? { source } : {}), ...(n ? { count: n } : {}),
  };
}

export function parseTimeline(v: unknown): TimelineResponse | null {
  if (!isObj(v) || !str(v.personId, 120) || !Array.isArray(v.events)) return null;
  const adapter = isObj(v.adapter) && str(v.adapter.id, 40) && str(v.adapter.label, 80)
    ? { id: str(v.adapter.id, 40)!, label: str(v.adapter.label, 80)! } : undefined;
  const reason = str(v.reason, 200);
  return {
    personId: str(v.personId, 120)!, available: v.available === true, since: str(v.since, 40) ?? '', truncated: v.truncated === true,
    events: v.events.slice(0, MAX_EVENTS).map(parseEvent).filter((e): e is TimelineEvent => e !== null),
    ...(adapter ? { adapter } : {}), ...(reason ? { reason } : {}),
  };
}

function tokens(v: Obj): Pick<UsageSummary, 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'> | null {
  const t = { inputTokens: count(v.inputTokens), outputTokens: count(v.outputTokens), cacheReadTokens: count(v.cacheReadTokens), cacheWriteTokens: count(v.cacheWriteTokens) };
  return Object.values(t).every((n) => n !== undefined) ? (t as Pick<UsageSummary, 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>) : null;
}

const cost = (v: unknown): number | null | undefined => (v === null ? null : count(v));

function parseModel(v: unknown): ModelUsage | null {
  if (!isObj(v) || !str(v.model, 120) || !oneOf(v.costSource, COST_SOURCES)) return null;
  const t = tokens(v);
  const c = cost(v.cost);
  if (!t || c === undefined) return null;
  const calls = count(v.calls);
  return { model: str(v.model, 120)!, ...t, cost: c, costSource: v.costSource, ...(calls === undefined ? {} : { calls }) };
}

function parseSummary(v: unknown): UsageSummary | null {
  if (!isObj(v) || !Array.isArray(v.unpricedModels) || !Array.isArray(v.models)) return null;
  const t = tokens(v);
  const c = cost(v.cost);
  if (!t || c === undefined) return null;
  return {
    ...t, cost: c,
    unpricedModels: v.unpricedModels.flatMap((m) => (str(m, 120) ? [str(m, 120)!] : [])),
    models: v.models.map(parseModel).filter((m): m is ModelUsage => m !== null),
  };
}

function parseRow(v: unknown): UsageRow | null {
  if (!isObj(v) || !str(v.personId, 120) || !str(v.name, 120) || !str(v.adapterId, 40) || !str(v.adapterLabel, 80)) return null;
  const usage = v.usage === null ? null : parseSummary(v.usage);
  if (v.usage !== null && !usage) return null;
  const unavailable = str(v.unavailable, 200);
  return {
    personId: str(v.personId, 120)!, name: str(v.name, 120)!, adapterId: str(v.adapterId, 40)!, adapterLabel: str(v.adapterLabel, 80)!, usage,
    ...(unavailable ? { unavailable } : {}),
  };
}

export function parseUsageReport(v: unknown): UsageReport | null {
  if (!isObj(v) || !oneOf(v.period, USAGE_PERIODS) || !Array.isArray(v.rows) || !isObj(v.priceTable)) return null;
  const totals = parseSummary(v.totals);
  if (!totals) return null;
  return {
    period: v.period, from: str(v.from, 40) ?? '', to: str(v.to, 40) ?? '', generatedAt: str(v.generatedAt, 40) ?? '', currency: 'USD', estimate: true,
    priceTable: { asOf: str(v.priceTable.asOf, 20) ?? '', source: str(v.priceTable.source, 600) ?? '', models: count(v.priceTable.models) ?? 0 },
    rows: v.rows.slice(0, MAX_ROWS).map(parseRow).filter((r): r is UsageRow => r !== null),
    totals,
  };
}
