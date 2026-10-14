// "Corporate" in the browser: budget gauges (spend of limit, percent, a bar capped at 100%), what Corporate did, who
// needs you because of a budget, and the top-bar badge. Unpriced usage says "can't price <model>" instead of a number.
import type { BudgetLevel, BudgetPeriod, BudgetStatus, BudgetsReport } from '@shared/controls';
import { formatUsd } from '../observability/ledgerModel';

export type GaugeLine = { period: BudgetPeriod; label: string; level: BudgetLevel; text: string; pctText: string; bar: number; note?: string };
export type CorporateBadge = { over: number; warn: number; label: string };

const LABEL: Record<BudgetPeriod, string> = { daily: 'Today', monthly: 'This month' };

function listed(models: readonly string[]): string {
  return models.slice(0, 2).join(', ') + (models.length > 2 ? ` +${models.length - 2}` : '');
}

export function gaugeLines(s: BudgetStatus): GaugeLine[] {
  return s.lines.map((l): GaugeLine => {
    const spent = l.spent === null ? '—' : formatUsd(l.spent);
    const note = l.level === 'no-data' ? 'no usage data'
      : l.unpricedModels.length ? (l.spent === null ? `can’t price ${listed(l.unpricedModels)}` : `plus usage it can’t price: ${listed(l.unpricedModels)}`)
      : undefined;
    return {
      period: l.period, label: LABEL[l.period], level: l.level, text: `${spent} of ${formatUsd(l.limit)}`,
      pctText: l.ratio === null ? '' : `${Math.round(l.ratio * 100)}%`, bar: l.ratio === null ? 0 : Math.min(1, Math.max(0, l.ratio)),
      ...(note ? { note } : {}),
    };
  });
}

export function budgetHeadline(s: BudgetStatus): string | null {
  if (s.level === 'over') return s.action === 'paused' ? 'Corporate froze the expense account' : 'Over budget: Corporate wants to talk to you';
  return s.level === 'warn' ? 'Near budget' : null;
}

/** Over budget and not paused by Corporate: it needs you (the "need you" count and HR · Approvals). */
export const budgetAlerts = (r: BudgetsReport | null): BudgetStatus[] => (r?.budgets ?? []).filter((b) => b.level === 'over' && b.action !== 'paused');

export function corporateBadge(r: BudgetsReport | null): CorporateBadge | null {
  const over = (r?.budgets ?? []).filter((b) => b.level === 'over').length;
  const warn = (r?.budgets ?? []).filter((b) => b.level === 'warn').length;
  if (!over && !warn) return null;
  const label = over && warn ? `${over} over budget, ${warn} near` : over ? `${over} over budget` : `${warn} near budget`;
  return { over, warn, label };
}

export const budgetOf = (r: BudgetsReport | null, personId: string): BudgetStatus | undefined => r?.budgets.find((b) => b.personId === personId);

/** How many more "need you": budget alerts for people not already asking (approvals, needs-input). */
export const extraNeedYou = (alerts: readonly BudgetStatus[], asking: ReadonlySet<string>): number => alerts.filter((b) => !asking.has(b.personId)).length;
