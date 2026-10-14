// Validation of GET /api/budgets and of a control verb's answer (POST /api/people/:id/actions): untrusted until parsed.
import {
  BUDGET_PERIODS, CONTROL_ACTIONS, type BudgetLevel, type BudgetLine, type BudgetStatus, type BudgetsReport, type ControlReply,
} from '@shared/controls';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 300): string | undefined => (typeof v === 'string' ? v.slice(0, max) : undefined);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): v is T => typeof v === 'string' && (allowed as readonly string[]).includes(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v: unknown): v is number | null => v === null || num(v);
const LEVELS: readonly BudgetLevel[] = ['ok', 'warn', 'over', 'unpriced', 'no-data'];
const ACTIONS = ['none', 'paused', 'alert'] as const;

function parseLine(v: unknown): BudgetLine | null {
  if (!isObj(v) || !oneOf(v.period, BUDGET_PERIODS) || !num(v.limit) || v.limit <= 0 || !numOrNull(v.spent) || !numOrNull(v.ratio)) return null;
  if (!oneOf(v.level, LEVELS) || typeof v.from !== 'string' || typeof v.to !== 'string' || !Array.isArray(v.unpricedModels)) return null;
  const unpricedModels = v.unpricedModels.filter((m): m is string => typeof m === 'string').map((m) => m.slice(0, 120)).slice(0, 20);
  return { period: v.period, limit: v.limit, spent: v.spent, ratio: v.ratio, level: v.level, from: v.from.slice(0, 40), to: v.to.slice(0, 40), unpricedModels };
}

function parseStatus(v: unknown): BudgetStatus | null {
  if (!isObj(v) || typeof v.personId !== 'string' || typeof v.name !== 'string' || !oneOf(v.level, LEVELS) || !oneOf(v.action, ACTIONS) || !Array.isArray(v.lines)) return null;
  const lines = v.lines.map(parseLine).filter((l): l is BudgetLine => l !== null);
  const adapterLabel = str(v.adapterLabel, 80);
  const note = str(v.note);
  const unavailable = str(v.unavailable);
  return {
    personId: v.personId.slice(0, 80), name: v.name.slice(0, 120), level: v.level, lines, action: v.action,
    ...(adapterLabel ? { adapterLabel } : {}), ...(note ? { note } : {}), ...(unavailable ? { unavailable } : {}),
  };
}

export function parseBudgetsReport(v: unknown): BudgetsReport | null {
  if (!isObj(v) || !Array.isArray(v.budgets) || typeof v.generatedAt !== 'string') return null;
  const budgets = v.budgets.map(parseStatus).filter((b): b is BudgetStatus => b !== null);
  return { generatedAt: v.generatedAt, currency: 'USD', estimate: true, autoPause: v.autoPause === true, warnAt: num(v.warnAt) ? v.warnAt : 0.8, budgets };
}

export function parseControlReply(v: unknown): ControlReply | null {
  if (!isObj(v) || v.ok !== true || !oneOf(v.action, CONTROL_ACTIONS) || typeof v.message !== 'string') return null;
  return { ok: true, action: v.action, message: v.message.slice(0, 300) };
}
