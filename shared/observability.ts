// Activity timeline and token/cost usage: the data the server sends the browser for "the documentary crew" (a bot's
// timeline) and "Angela's ledger" (tokens and estimated cost per bot). Additive to contract.ts; nothing here carries
// message text beyond a short, scrubbed one-line summary, and task events carry titles only.

/** What happened. Grouped in the UI as messages, tools, tasks, scheduled jobs, sessions and errors. */
export const TIMELINE_KINDS = [
  'session.started', 'session.ended',
  'message.in', 'message.out',
  'tool.call', 'activity',
  'task.created', 'task.started', 'task.finished', 'task.blocked',
  'cron.ok', 'cron.fail',
  'status', 'error',
] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export type TimelineEvent = {
  id: string; // unique within one person's timeline
  at: string; // ISO time
  kind: TimelineKind;
  title: string; // short and scrubbed: a task title, a job name, a tool, a one-line message summary
  detail?: string; // short and scrubbed: "delivered", "26 tool calls", an error's first line, ...
  source?: string; // where it happened: telegram, cron, kanban, cli, webhook, claude-code, log, ...
  count?: number; // more than one of the same thing folded into this event (tool calls in a session, repeats)
};

export type TimelineResponse = {
  personId: string;
  adapter?: { id: string; label: string };
  available: boolean; // false: no bot, or its adapter keeps no timeline (see reason)
  reason?: string;
  since: string; // ISO; events are at or after this
  events: TimelineEvent[]; // newest first
  truncated: boolean; // more events than `limit` happened since `since`
};

export const TIMELINE_DEFAULT_LIMIT = 200;
export const TIMELINE_MAX_LIMIT = 1000;
export const TIMELINE_MAX_DAYS = 31;

export const USAGE_PERIODS = ['today', '7d', '30d'] as const;
export type UsagePeriod = (typeof USAGE_PERIODS)[number];

/**
 * Where a model's cost came from: `recorded` = the agent's own bookkeeping (Hermes' cost columns), `price-table` = our
 * dated price table, `included` = the agent says it is covered by a subscription (0), `unpriced` = no price known.
 * Every cost is an estimate.
 */
export type CostSource = 'recorded' | 'price-table' | 'included' | 'unpriced';

export type TokenCounts = {
  inputTokens: number; // uncached input
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type ModelUsage = TokenCounts & {
  model: string;
  calls?: number; // API calls, when the agent counts them
  cost: number | null; // in `currency`; null = unpriced
  costSource: CostSource;
};

export type UsageSummary = TokenCounts & {
  cost: number | null; // sum of the priced models; null = nothing priced
  unpricedModels: string[]; // models with tokens but no price (their cost is missing from `cost`)
  models: ModelUsage[]; // biggest first
};

export type UsageRow = {
  personId: string;
  name: string;
  adapterId: string;
  adapterLabel: string;
  usage: UsageSummary | null; // null: the adapter keeps no usage data (see `unavailable`)
  unavailable?: string; // e.g. "No usage data from Claude Code"
};

export type PriceTableInfo = { asOf: string; source: string; models: number };

export type UsageReport = {
  period: UsagePeriod;
  from: string; // ISO
  to: string; // ISO
  generatedAt: string;
  currency: 'USD';
  estimate: true; // costs are always estimates
  priceTable: PriceTableInfo;
  rows: UsageRow[]; // one per seated agent; priced rows by cost, then tokens
  totals: UsageSummary;
};

/** Every prompt token the model processed: uncached input plus cache reads and writes. */
export const tokensIn = (t: TokenCounts): number => t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens;
