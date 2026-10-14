// profiles/<p>/state.db -> tokens per model in a window. Hermes 0.21 keeps them per session and model in
// `session_model_usage` (input/output/cache_read/cache_write/reasoning tokens, api_call_count, estimated_cost_usd,
// actual_cost_usd, cost_status, first_seen/last_seen); older versions only on `sessions` (one model per session).
// A row counts in the window of its last activity.
import type { ModelTokens, RecordedCost } from '../adapters/types.ts';
import type { EpochSeconds } from './types.ts';
import { num, str } from './guards.ts';
import type { ReadDb, Row } from './sqlite.ts';

/** Column sums; `t` is the table alias ('u.' or ''). */
const sums = (t: string) => `SUM(${t}input_tokens) AS i, SUM(${t}output_tokens) AS o, SUM(${t}cache_read_tokens) AS cr,
  SUM(${t}cache_write_tokens) AS cw, SUM(${t}reasoning_tokens) AS r, SUM(${t}api_call_count) AS calls, SUM(${t}actual_cost_usd) AS act,
  SUM(${t}estimated_cost_usd) AS est,
  SUM(CASE WHEN ${t}cost_status = 'included' OR ${t}billing_mode = 'subscription_included' THEN 0 ELSE 1 END) AS billed`;

const count = (v: unknown): number => Math.max(0, Math.round(num(v) ?? 0));

function recorded(r: Row): RecordedCost | undefined {
  const actual = num(r.act) ?? 0;
  const estimated = num(r.est) ?? 0;
  if (actual > 0) return { amount: actual, kind: 'actual' };
  if (estimated > 0) return { amount: estimated, kind: 'estimated' };
  return count(r.billed) === 0 ? { amount: 0, kind: 'included' } : undefined;
}

function toTokens(r: Row): ModelTokens | null {
  const model = str(r.model, 120)?.trim();
  if (!model) return null;
  const cost = recorded(r);
  return {
    model, inputTokens: count(r.i), outputTokens: count(r.o), cacheReadTokens: count(r.cr), cacheWriteTokens: count(r.cw),
    reasoningTokens: count(r.r), calls: count(r.calls), ...(cost ? { recordedCost: cost } : {}),
  };
}

function hasTable(db: ReadDb, name: string): boolean {
  return db.all(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`, name).length > 0;
}

export function readModelUsage(db: ReadDb, from: EpochSeconds, to: EpochSeconds): ModelTokens[] {
  const rows = hasTable(db, 'session_model_usage')
    ? db.all(
      `SELECT u.model, ${sums('u.')}
       FROM session_model_usage u LEFT JOIN sessions s ON s.id = u.session_id
       WHERE COALESCE(u.last_seen, u.first_seen, s.last_activity_at, s.started_at) >= ?
         AND COALESCE(u.last_seen, u.first_seen, s.last_activity_at, s.started_at) < ?
       GROUP BY u.model`, from, to)
    : db.all(
      `SELECT model, ${sums('')} FROM sessions
       WHERE model IS NOT NULL AND COALESCE(last_activity_at, started_at) >= ? AND COALESCE(last_activity_at, started_at) < ?
       GROUP BY model`, from, to);
  return rows.map(toTokens).filter((t): t is ModelTokens => t !== null);
}
