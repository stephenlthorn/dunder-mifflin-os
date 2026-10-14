// The demo day's token usage, for Angela's ledger and Corporate's budgets: each demo bot spends a fictional amount
// per office day, accrued as the clock runs (nothing at 08:30, all of it at 17:30). Earlier days in a window count in
// full. The imports bot runs on a local model nobody priced, so its gauge says "can't price chili-7b-local".
import type { BudgetConfig } from '../../budgets/config.ts';
import type { AgentUsage, ModelTokens, UsageWindow } from '../types.ts';
import { DAY_MINUTES, DAY_START } from '../../../../shared/demo/time.ts';

type Spend = { readonly model: string; readonly usd?: number; readonly input: number; readonly output: number };

/** Per office day. Costs are recorded as estimates, like a bot that keeps its own books. */
const DAILY: Readonly<Record<string, Spend>> = Object.freeze({
  frontdesk: { model: 'claude-haiku-demo', usd: 0.6, input: 400_000, output: 40_000 },
  manager: { model: 'claude-sonnet-demo', usd: 1.1, input: 300_000, output: 50_000 },
  sales: { model: 'claude-sonnet-demo', usd: 3.2, input: 900_000, output: 120_000 },
  accounts: { model: 'claude-haiku-demo', usd: 0.4, input: 250_000, output: 20_000 },
  analyst: { model: 'claude-sonnet-demo', usd: 0.9, input: 260_000, output: 45_000 },
  imports: { model: 'chili-7b-local', input: 700_000, output: 60_000 },
  social: { model: 'claude-sonnet-demo', usd: 2.4, input: 650_000, output: 95_000 },
  community: { model: 'claude-haiku-demo', usd: 0.3, input: 180_000, output: 18_000 },
  research: { model: 'claude-sonnet-demo', usd: 1.6, input: 520_000, output: 70_000 },
  strategy: { model: 'claude-sonnet-demo', usd: 0.2, input: 60_000, output: 9_000 },
  it: { model: 'claude-haiku-demo', usd: 0.5, input: 330_000, output: 25_000 },
  assistant: { model: 'claude-haiku-demo', usd: 0.7, input: 420_000, output: 38_000 },
  wellness: { model: 'claude-haiku-demo', usd: 0.1, input: 40_000, output: 4_000 },
});

/** Corporate's budgets in the demo (person ids): two daily limits that bite in the afternoon, a monthly one, Kevin. */
export const DEMO_BUDGETS: BudgetConfig = Object.freeze({
  autoPause: false,
  limits: Object.freeze({ dwight: { daily: 3 }, kelly: { daily: 1.5 }, kevin: { daily: 1 }, michael: { monthly: 40 } }),
});

const DAY_MS = 86_400_000;

function midnight(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** How many office days the window holds: whole days before today, plus today's share of the office day so far. */
export function officeDays(window: UsageWindow, officeMinute: number): number {
  const from = Date.parse(window.from);
  const today = midnight(Date.parse(window.to));
  const before = Math.max(0, Math.round((today - Math.max(from, today - 400 * DAY_MS)) / DAY_MS));
  const share = Math.min(1, Math.max(0, (officeMinute - DAY_START) / DAY_MINUTES));
  return before + share;
}

export function demoUsage(agent: string, window: UsageWindow, officeMinute: number): AgentUsage | null {
  const spend = DAILY[agent];
  if (!spend) return null;
  const days = officeDays(window, officeMinute);
  const row: ModelTokens = {
    model: spend.model, inputTokens: Math.round(spend.input * days), outputTokens: Math.round(spend.output * days),
    cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0,
    ...(spend.usd === undefined ? {} : { recordedCost: { amount: Math.round(spend.usd * days * 1e6) / 1e6, kind: 'estimated' as const } }),
  };
  return { models: [row] };
}
