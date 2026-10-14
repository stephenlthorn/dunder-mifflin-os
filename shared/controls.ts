// Control verbs ("send a bot home", stop its run, run a job now, hand a card to someone else) and budgets
// ("Corporate"): what the browser sends to POST /api/people/:id/actions and what GET /api/budgets answers.
// Additive to contract.ts. Every verb needs the server to allow writes, sign-in when it is on, and the agent's
// adapter to declare the matching capability flag (ACTION_FLAG); every verb is written to the audit log first.

export const CONTROL_ACTIONS = ['pause', 'resume', 'stop', 'run-job', 'reassign'] as const;
export type ControlAction = (typeof CONTROL_ACTIONS)[number];

/** The body of POST /api/people/:id/actions. `stop` may name the running card (a bot can run several). */
export type ControlRequest =
  | { action: 'pause' }
  | { action: 'resume' }
  | { action: 'stop'; args?: { taskId: string } }
  | { action: 'run-job'; args: { jobId: string } } // ScheduledJob.id
  | { action: 'reassign'; args: { taskId: string; to: string } }; // to: the person id of another bot, same adapter

/** A 200 answer: what happened, in a sentence the UI shows. */
export type ControlReply = { ok: true; action: ControlAction; message: string };

/** The AgentCapabilities flag each verb needs (resume comes with pause). */
export const ACTION_FLAG = Object.freeze({ pause: 'pause', resume: 'pause', stop: 'stop', 'run-job': 'runJob', reassign: 'reassign' } as const);

export const BUDGET_PERIODS = ['daily', 'monthly'] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];
/** Amber from 80% of a budget; at 100% Corporate freezes the expense account. */
export const BUDGET_WARN_AT = 0.8;

/** `unpriced`: tokens but no price for the model (never pauses); `no-data`: the adapter keeps no usage. */
export type BudgetLevel = 'ok' | 'warn' | 'over' | 'unpriced' | 'no-data';

export type BudgetLine = {
  period: BudgetPeriod;
  limit: number; // USD
  spent: number | null; // estimated USD of the priced usage so far this period; null = nothing priced or no data
  ratio: number | null; // spent / limit
  level: BudgetLevel;
  from: string; // ISO: local midnight (daily) or the 1st of the month (monthly)
  to: string; // ISO: now
  unpricedModels: string[]; // usage the estimate leaves out ("can't price <model>")
};

/** At 100%: `paused` = Corporate froze the expense account (auto-pause); `alert` = it needs you. */
export type BudgetAction = 'none' | 'paused' | 'alert';

export type BudgetStatus = {
  personId: string;
  name: string;
  adapterLabel?: string;
  level: BudgetLevel; // the worst of its lines
  lines: BudgetLine[];
  action: BudgetAction;
  note?: string; // why an over-budget bot was not paused, or when it was
  unavailable?: string; // e.g. "No usage data from Claude Code"
};

export type BudgetsReport = {
  generatedAt: string;
  currency: 'USD';
  estimate: true; // costs are estimates (Angela's ledger rules)
  autoPause: boolean; // budgets.autoPause in config.yaml (default false)
  warnAt: number;
  budgets: BudgetStatus[]; // one per budgeted person, worst first
};

const RANK: Readonly<Record<BudgetLevel, number>> = { over: 4, warn: 3, unpriced: 2, 'no-data': 1, ok: 0 };
export const budgetRank = (level: BudgetLevel): number => RANK[level];
