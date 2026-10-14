// Budget periods in the server's local time (the clock the agents' logs use): a day runs from local midnight, a month
// from local midnight on the 1st. Both windows end now.
import type { BudgetPeriod } from '../../../shared/controls.ts';
import type { UsageWindow } from '../adapters/types.ts';

export function budgetWindow(period: BudgetPeriod, nowMs: number): UsageWindow {
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  if (period === 'monthly') start.setDate(1);
  return { from: start.toISOString(), to: new Date(nowMs).toISOString() };
}
