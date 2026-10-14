// Corporate's report for the whole office: GET /api/budgets every minute while live (the server also checks on its own
// and pauses over-budget bots when configured), or the fictional demo report. null: no report (yet, or no budgets).
import { useEffect, useState } from 'react';
import type { OfficeSnapshot } from '@shared/contract';
import type { BudgetsReport } from '@shared/controls';
import { fetchBudgets } from '../data/controlsApi';
import { demoBudgets } from './demoCorporate';

const REFRESH_MS = 60_000;

export function useBudgets(snapshot: OfficeSnapshot | null, demo: boolean): BudgetsReport | null {
  const [report, setReport] = useState<BudgetsReport | null>(null);
  const live = snapshot !== null && !demo;
  useEffect(() => {
    if (!live) return undefined;
    const ctrl = new AbortController();
    const load = () => fetchBudgets(ctrl.signal).then((r) => { if (!ctrl.signal.aborted) setReport(r); }, () => {});
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => { ctrl.abort(); clearInterval(timer); };
  }, [live]);
  if (demo && snapshot) return demoBudgets(snapshot);
  return live ? report : null;
}
