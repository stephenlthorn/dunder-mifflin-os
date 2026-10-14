// "Angela's ledger": rows of tokens and estimated cost per bot, sorted, with bar lengths to scale (0..1 of the
// biggest), plus the totals. A bot whose adapter keeps no usage says so instead of showing zeros. Pure.
import { tokensIn, type UsageReport, type UsageSummary } from '@shared/observability';

export type LedgerMetric = 'cost' | 'tokens';

export type LedgerRow = {
  personId: string;
  name: string;
  adapterLabel: string;
  available: boolean;
  tokensIn: number;
  tokensOut: number;
  cost: number | null;
  bar: number; // 0..1, to scale against the biggest row
  valueText: string; // what the bar stands for
  note?: string; // "No price for X", "Plus unpriced X", "No usage data from Claude Code"
};

export type LedgerView = { rows: LedgerRow[]; totalText: string; totalTokensIn: number; totalTokensOut: number; totalCost: number | null; partial: boolean };

export function formatUsd(n: number | null): string {
  if (n === null) return '—';
  if (n > 0 && n < 0.005) return '<$0.01';
  if (n >= 1000) return `$${Math.round(n).toLocaleString('en-US')}`;
  return `$${n.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);
}

const total = (u: UsageSummary) => tokensIn(u) + u.outputTokens;

function noteFor(u: UsageSummary): string | undefined {
  if (!u.unpricedModels.length) return undefined;
  const names = u.unpricedModels.slice(0, 2).join(', ') + (u.unpricedModels.length > 2 ? ` +${u.unpricedModels.length - 2}` : '');
  return u.cost === null ? `No price for ${names}` : `Plus unpriced ${names}`;
}

export function ledgerView(report: UsageReport, metric: LedgerMetric): LedgerView {
  const value = (u: UsageSummary) => (metric === 'cost' ? (u.cost ?? 0) : total(u));
  const available = report.rows.filter((r) => r.usage !== null);
  const max = Math.max(0, ...available.map((r) => value(r.usage!)));
  const rank = (u: UsageSummary) => (metric === 'cost' && u.cost === null ? -1 : value(u));
  const rows: LedgerRow[] = [
    ...[...available].sort((a, b) => rank(b.usage!) - rank(a.usage!) || total(b.usage!) - total(a.usage!)).map((r): LedgerRow => {
      const u = r.usage!;
      const note = noteFor(u);
      return {
        personId: r.personId, name: r.name, adapterLabel: r.adapterLabel, available: true, tokensIn: tokensIn(u), tokensOut: u.outputTokens, cost: u.cost,
        bar: max > 0 ? value(u) / max : 0,
        valueText: metric === 'cost' ? formatUsd(u.cost) : formatTokens(total(u)),
        ...(note ? { note } : {}),
      };
    }),
    ...report.rows.filter((r) => r.usage === null).map((r): LedgerRow => ({
      personId: r.personId, name: r.name, adapterLabel: r.adapterLabel, available: false, tokensIn: 0, tokensOut: 0, cost: null, bar: 0, valueText: '',
      note: r.unavailable ?? `No usage data from ${r.adapterLabel}`,
    })),
  ];
  const t = report.totals;
  return {
    rows, totalTokensIn: tokensIn(t), totalTokensOut: t.outputTokens, totalCost: t.cost, partial: t.unpricedModels.length > 0,
    totalText: metric === 'cost' ? formatUsd(t.cost) : formatTokens(total(t)),
  };
}
