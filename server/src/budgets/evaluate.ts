// Budget math, pure: one budget line (a limit for a period) against the period's usage summary. Only PRICED usage is
// spend; unpriced models are named ("can't price <model>") and can never make a line "over" on their own.
import { BUDGET_WARN_AT, type BudgetLevel, type BudgetLine, type BudgetPeriod, budgetRank } from '../../../shared/controls.ts';
import type { UsageSummary } from '../../../shared/observability.ts';
import type { UsageWindow } from '../adapters/types.ts';

const round = (n: number) => Math.round(n * 1e6) / 1e6;

function levelOf(ratio: number | null, unpriced: boolean, noData: boolean): BudgetLevel {
  if (noData) return 'no-data';
  if (ratio !== null && ratio >= 1) return 'over';
  if (ratio !== null && ratio >= BUDGET_WARN_AT) return 'warn';
  return unpriced ? 'unpriced' : 'ok';
}

export function budgetLine(period: BudgetPeriod, limit: number, window: UsageWindow, usage: UsageSummary | null): BudgetLine {
  const spent = usage?.cost ?? null;
  const ratio = spent === null ? null : round(spent / limit);
  const unpricedModels = usage ? [...usage.unpricedModels] : [];
  return { period, limit, spent, ratio, level: levelOf(ratio, unpricedModels.length > 0, usage === null), from: window.from, to: window.to, unpricedModels };
}

export function worstLevel(levels: ReadonlyArray<BudgetLevel>): BudgetLevel {
  return levels.reduce<BudgetLevel>((worst, l) => (budgetRank(l) > budgetRank(worst) ? l : worst), 'ok');
}
