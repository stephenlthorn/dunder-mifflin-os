// "Corporate": reads each budgeted bot's usage for the day and the calendar month (Angela's ledger's prices), and at
// 100% of a budget freezes the expense account: it pauses the bot through the office's control verbs (audited, actor
// 'corporate') ONLY when `budgets.autoPause` is true AND the bot's adapter can pause; otherwise it raises an alert for
// you. Unpriced usage is never spend, so it never pauses anything. One pause attempt per bot per period window: if you
// resume a bot by hand, Corporate leaves it alone until the next day or month (or until you raise its budget).
import type { Person } from '../../../shared/contract.ts';
import {
  BUDGET_PERIODS, BUDGET_WARN_AT, type BudgetAction, type BudgetLine, type BudgetStatus, type BudgetsReport, budgetRank,
} from '../../../shared/controls.ts';
import type { UsageRow } from '../../../shared/observability.ts';
import type { UsageWindow } from '../adapters/types.ts';
import { log, redact } from '../log.ts';
import type { ControlOutcome } from '../office/controls.ts';
import type { BudgetConfig, BudgetLimits } from './config.ts';
import { budgetLine, worstLevel } from './evaluate.ts';
import { budgetWindow } from './periods.ts';

export type BudgetMonitorOptions = {
  readonly config: BudgetConfig;
  readonly people: () => Promise<ReadonlyArray<Person>>;
  readonly usageIn: (personId: string, window: UsageWindow) => Promise<UsageRow | null>;
  readonly pause: (personId: string, reason: string) => Promise<ControlOutcome>; // office.act(…, 'corporate', reason)
  readonly nowMs: () => number;
  readonly cacheMs?: number; // reuse a report this long (several tabs polling); default 15 s
};

type Attempt = { readonly ok: boolean; readonly at: number; readonly error?: string };
type Read = { readonly line: BudgetLine; readonly row: UsageRow | null };

const DEFAULT_CACHE_MS = 15_000;
const KEEP_ATTEMPTS_MS = 40 * 86_400_000;
const usd = (n: number | null) => (n === null ? '—' : `$${n.toFixed(2)}`);
const keyOf = (personId: string, line: BudgetLine) => `${personId}|${line.period}|${line.from}`;

function periodsOf(limits: BudgetLimits): Array<[BudgetLine['period'], number]> {
  return BUDGET_PERIODS.flatMap((p): Array<[BudgetLine['period'], number]> => (limits[p] === undefined ? [] : [[p, limits[p]!]]));
}

function sortWorstFirst(list: ReadonlyArray<BudgetStatus>): BudgetStatus[] {
  const top = (s: BudgetStatus) => Math.max(-1, ...s.lines.map((l) => l.ratio ?? -1));
  return [...list].sort((a, b) => budgetRank(b.level) - budgetRank(a.level) || top(b) - top(a) || a.name.localeCompare(b.name));
}

export function createBudgetMonitor(opts: BudgetMonitorOptions) {
  const cacheMs = opts.cacheMs ?? DEFAULT_CACHE_MS;
  let attempts: ReadonlyMap<string, Attempt> = new Map();
  let cached: { readonly at: number; readonly report: BudgetsReport } | null = null;
  let inflight: Promise<BudgetsReport> | null = null;
  let timer: NodeJS.Timeout | null = null;

  async function freeze(person: Person, over: ReadonlyArray<BudgetLine>, label: string): Promise<{ action: BudgetAction; note: string }> {
    if (!opts.config.autoPause) return { action: 'alert', note: 'Auto-pause is off (budgets.autoPause in config.yaml)' };
    if (person.bot?.capabilities?.pause !== true) return { action: 'alert', note: `${label} agents can't be paused; Corporate can only call you` };
    const first = over[0]!;
    const done = over.map((l) => attempts.get(keyOf(person.id, l))).find((a) => a !== undefined);
    const attempt = done ?? await (async (): Promise<Attempt> => {
      const out = await opts.pause(person.id, `Over its ${first.period} budget (${usd(first.spent)} of ${usd(first.limit)})`);
      const made: Attempt = out.ok ? { ok: true, at: opts.nowMs() } : { ok: false, at: opts.nowMs(), error: out.error };
      attempts = new Map([...attempts, ...over.map((l) => [keyOf(person.id, l), made] as const)]);
      log('budget.freeze', { person: person.id, period: first.period, ok: made.ok });
      return made;
    })();
    return attempt.ok
      ? { action: 'paused', note: `Corporate froze the expense account: paused at 100% of its ${first.period} budget` }
      : { action: 'alert', note: `Could not pause: ${attempt.error ?? 'unknown error'}` };
  }

  async function statusOf(personId: string, limits: BudgetLimits, person: Person | undefined, now: number): Promise<BudgetStatus> {
    const name = person?.name ?? personId;
    const periods = periodsOf(limits);
    if (!person?.bot) {
      const lines = periods.map(([p, limit]) => budgetLine(p, limit, budgetWindow(p, now), null));
      return { personId, name, level: 'no-data', lines, action: 'none', unavailable: 'No bot at this desk' };
    }
    const reads: Read[] = await Promise.all(periods.map(async ([period, limit]): Promise<Read> => {
      const window = budgetWindow(period, now);
      const row = await opts.usageIn(personId, window);
      return { line: budgetLine(period, limit, window, row?.usage ?? null), row };
    }));
    const lines = reads.map((r) => r.line);
    const row = reads.find((r) => r.row)?.row;
    const label = row?.adapterLabel ?? person.bot.adapter ?? 'Its';
    const unavailable = reads.find((r) => r.row && r.row.usage === null)?.row?.unavailable ?? (row ? undefined : `No usage data from ${label}`);
    const over = lines.filter((l) => l.level === 'over');
    const outcome = over.length ? await freeze(person, over, label) : { action: 'none' as const };
    return {
      personId, name, level: worstLevel(lines.map((l) => l.level)), lines, ...outcome,
      ...(row ? { adapterLabel: row.adapterLabel } : {}), ...(unavailable ? { unavailable } : {}),
    };
  }

  async function evaluate(): Promise<BudgetsReport> {
    const now = opts.nowMs();
    attempts = new Map([...attempts].filter(([, a]) => now - a.at < KEEP_ATTEMPTS_MS));
    const entries = Object.entries(opts.config.limits);
    const people = entries.length ? await opts.people() : [];
    const budgets = await Promise.all(entries.map(([id, limits]) => statusOf(id, limits, people.find((p) => p.id === id), now)));
    return {
      generatedAt: new Date(now).toISOString(), currency: 'USD', estimate: true, autoPause: opts.config.autoPause, warnAt: BUDGET_WARN_AT,
      budgets: sortWorstFirst(budgets),
    };
  }

  /** The current report; evaluates (and freezes over-budget bots) unless a report from the last `cacheMs` exists. */
  async function check(): Promise<BudgetsReport> {
    if (cached && opts.nowMs() - cached.at < cacheMs) return cached.report;
    inflight ??= evaluate().then((report) => {
      cached = { at: opts.nowMs(), report };
      return report;
    }).finally(() => { inflight = null; });
    return inflight;
  }

  /** Check every `intervalMs` so Corporate acts with no browser open. No budgets or no interval: no timer. */
  function start(intervalMs: number): void {
    if (timer || intervalMs <= 0 || !Object.keys(opts.config.limits).length) return;
    timer = setInterval(() => {
      check().catch((error: unknown) => log('budget.check_failed', { detail: redact(error instanceof Error ? error.message : String(error)) }));
    }, intervalMs);
    timer.unref();
  }

  function close(): void {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { check, start, close };
}

export type BudgetMonitor = ReturnType<typeof createBudgetMonitor>;
