// The office's view of what agents did and what they cost: a person's timeline ("the documentary crew") and
// tokens + estimated cost per bot ("Angela's ledger"). Routes each person to the adapter seated at their desk.
//
// Budgets (budgets/monitor.ts) use `usageIn(personId, window)`; `usageOf(personId, period)` is one bot's UsageRow, whose
// `usage.cost` is the estimated USD for the period (null = nothing priced, `usage: null` = its adapter keeps no
// usage) and `usage.unpricedModels` names what the estimate is missing. `usageReport(period)` is every bot at once.
import type { OfficeSnapshot } from '../../../shared/contract.ts';
import {
  type TimelineResponse, type UsagePeriod, type UsageReport, type UsageRow, type UsageSummary, tokensIn,
} from '../../../shared/observability.ts';
import type { AgentAdapter, TimelineQuery, UsageWindow } from '../adapters/types.ts';
import { log, redact } from '../log.ts';
import type { Office } from './office.ts';
import type { Seat } from './seating.ts';
import { combineSummaries, summariseUsage } from '../usage/pricing.ts';
import { usageWindow } from '../usage/periods.ts';
import type { PriceTable } from '../usage/priceTable.ts';

export type ObservabilityOptions = {
  readonly adapters: ReadonlyArray<AgentAdapter>;
  readonly read: () => Promise<Office>;
  readonly prices: PriceTable;
  readonly nowMs: () => number;
};

const failed = (what: string, adapter: AgentAdapter, error: unknown) =>
  log(`observability.${what}_failed`, { adapter: adapter.id, detail: redact(error instanceof Error ? error.message : String(error)) });

function seatOf(office: Office, personId: string): Seat | undefined {
  return office.seating.staff.get(personId) ?? office.seating.temps.find((t) => t.personId === personId);
}

const sortRows = (rows: ReadonlyArray<UsageRow>): UsageRow[] => [...rows].sort((a, b) => {
  if (!a.usage || !b.usage) return a.usage ? -1 : b.usage ? 1 : a.name.localeCompare(b.name);
  return (b.usage.cost ?? -1) - (a.usage.cost ?? -1) || tokensIn(b.usage) + b.usage.outputTokens - (tokensIn(a.usage) + a.usage.outputTokens);
});

export function createObservability(opts: ObservabilityOptions) {
  const byId = new Map(opts.adapters.map((a) => [a.id, a]));

  async function timeline(personId: string, query: TimelineQuery): Promise<TimelineResponse | null> {
    const office = await opts.read();
    if (!office.snapshot.people.some((p) => p.id === personId)) return null;
    const base = { personId, since: query.since, events: [], truncated: false };
    const seat = seatOf(office, personId);
    const adapter = seat ? byId.get(seat.adapterId) : undefined;
    if (!seat || !adapter) return { ...base, available: false, reason: 'No bot yet' };
    const who = { adapter: { id: adapter.id, label: adapter.label } };
    if (!adapter.timeline) return { ...base, ...who, available: false, reason: `No timeline from ${adapter.label}` };
    try {
      const events = await adapter.timeline(seat.agentId, { since: query.since, limit: query.limit + 1 });
      if (!events) return { ...base, ...who, available: false, reason: 'Nothing recorded for this agent yet' };
      return { ...base, ...who, available: true, events: events.slice(0, query.limit), truncated: events.length > query.limit };
    } catch (error) {
      failed('timeline', adapter, error);
      return { ...base, ...who, available: false, reason: `Could not read the timeline from ${adapter.label}` };
    }
  }

  async function rowFor(snapshot: OfficeSnapshot, seat: Seat, window: UsageWindow): Promise<UsageRow | null> {
    const adapter = byId.get(seat.adapterId);
    const person = snapshot.people.find((p) => p.id === seat.personId);
    if (!adapter || !person) return null;
    const base = { personId: person.id, name: person.name, adapterId: adapter.id, adapterLabel: adapter.label };
    const none = { ...base, usage: null, unavailable: `No usage data from ${adapter.label}` };
    if (!adapter.usage) return none;
    try {
      const usage = await adapter.usage(seat.agentId, window);
      return usage ? { ...base, usage: summariseUsage(usage.models, opts.prices) } : none;
    } catch (error) {
      failed('usage', adapter, error);
      return none;
    }
  }

  /** One bot's tokens and estimated cost for the period; null when nobody with a bot sits at that desk. */
  async function usageOf(personId: string, period: UsagePeriod): Promise<UsageRow | null> {
    const office = await opts.read();
    const seat = seatOf(office, personId);
    return seat ? rowFor(office.snapshot, seat, usageWindow(period, opts.nowMs())) : null;
  }

  /** The same for any window (budgets: the day or calendar month so far, budgets/periods.ts). */
  async function usageIn(personId: string, window: UsageWindow): Promise<UsageRow | null> {
    const office = await opts.read();
    const seat = seatOf(office, personId);
    return seat ? rowFor(office.snapshot, seat, window) : null;
  }

  async function usageReport(period: UsagePeriod): Promise<UsageReport> {
    const office = await opts.read();
    const seats = [...office.seating.staff.values(), ...office.seating.temps];
    const window = usageWindow(period, opts.nowMs());
    const rows = sortRows((await Promise.all(seats.map((s) => rowFor(office.snapshot, s, window)))).filter((r): r is UsageRow => r !== null));
    const totals: UsageSummary = combineSummaries(rows.flatMap((r) => (r.usage ? [r.usage] : [])));
    return {
      period, from: window.from, to: window.to, generatedAt: new Date(opts.nowMs()).toISOString(), currency: 'USD', estimate: true,
      priceTable: { asOf: opts.prices.asOf, source: opts.prices.source, models: Object.keys(opts.prices.models).length },
      rows, totals,
    };
  }

  return { timeline, usageOf, usageIn, usageReport };
}

export type Observability = ReturnType<typeof createObservability>;
