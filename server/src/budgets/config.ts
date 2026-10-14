// `budgets:` in ~/.dunder-mifflin-os/config.yaml ("Corporate"): per-person USD limits for a day and/or a calendar month,
// plus `autoPause` (default false). Keys are person ids (characters, or temps at spare desks).
//
//   budgets:
//     autoPause: true              # at 100%, pause the bot when its adapter can pause (else: just alert)
//     dwight: { monthly: 20 }
//     kelly: { daily: 1.5, monthly: 30 }
import { STAFF } from '../../../shared/office.ts';
import type { BudgetPeriod } from '../../../shared/controls.ts';
import { isRecord } from '../hermes/guards.ts';

export type BudgetLimits = Readonly<Partial<Record<BudgetPeriod, number>>>;
export type BudgetConfig = { readonly autoPause: boolean; readonly limits: Readonly<Record<string, BudgetLimits>> };

const PERSON_IDS: ReadonlySet<string> = new Set(STAFF.map((s) => s.id));
const TEMP_ID = /^temp-[a-z][a-z0-9-]{0,11}-[a-z0-9][a-z0-9-]{0,40}$/;
const PERIOD_KEYS = ['daily', 'monthly'] as const;
const MAX_USD = 1_000_000;

class BudgetError extends Error {}

function limits(personId: string, raw: unknown): BudgetLimits {
  const where = `budgets.${personId}`;
  if (!PERSON_IDS.has(personId) && !TEMP_ID.test(personId)) throw new BudgetError(`${where}: "${personId.slice(0, 40)}" is not a character (see shared/office/staff.ts)`);
  if (!isRecord(raw)) throw new BudgetError(`${where}: expected { daily, monthly } in USD`);
  const extra = Object.keys(raw).find((k) => !(PERIOD_KEYS as ReadonlyArray<string>).includes(k));
  if (extra) throw new BudgetError(`${where}: unknown field "${extra.slice(0, 40)}" (expected ${PERIOD_KEYS.join(', ')})`);
  const entries = PERIOD_KEYS.flatMap((period): Array<[BudgetPeriod, number]> => {
    const v = raw[period];
    if (v === undefined) return [];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > MAX_USD) throw new BudgetError(`${where}.${period}: a number of USD above 0 (at most ${MAX_USD})`);
    return [[period, v]];
  });
  if (!entries.length) throw new BudgetError(`${where}: give a daily or a monthly limit (USD)`);
  return Object.freeze(Object.fromEntries(entries));
}

export function parseBudgets(raw: unknown): { ok: true; value: BudgetConfig } | { ok: false; error: string } {
  try {
    if (!isRecord(raw)) throw new BudgetError('budgets: expected a mapping like { dwight: { monthly: 20 } }');
    if (raw.autoPause !== undefined && typeof raw.autoPause !== 'boolean') throw new BudgetError('budgets.autoPause: true or false');
    const people = Object.entries(raw).filter(([k]) => k !== 'autoPause').map(([id, v]) => [id, limits(id, v)] as const);
    return { ok: true, value: { autoPause: raw.autoPause === true, limits: Object.freeze(Object.fromEntries(people)) } };
  } catch (error) {
    if (error instanceof BudgetError) return { ok: false, error: error.message };
    throw error;
  }
}
