// Demo-mode stand-ins for the timeline and the ledger: made-up, deterministic events and token counts for the demo
// office (no server, no real data). Times are minutes before the snapshot's time, so the demo day always reads well.
import type { OfficeSnapshot, Person } from '@shared/contract';
import type { ModelUsage, TimelineEvent, TimelineResponse, UsagePeriod, UsageReport, UsageRow, UsageSummary } from '@shared/observability';

type Ev = Omit<TimelineEvent, 'id' | 'at'> & { ago: number };

const DWIGHT: readonly Ev[] = [
  { ago: 9, kind: 'tool.call', title: 'crm: list_leads, terminal', detail: '14 tool calls', count: 14, source: 'telegram' },
  { ago: 12, kind: 'task.started', title: 'Audit the Q4 campaign report', source: 'kanban' },
  { ago: 25, kind: 'message.out', title: 'Fourteen new leads since this morning. Two bounced. I blame Andy.', source: 'telegram' },
  { ago: 27, kind: 'message.in', title: '[Jan] How many new leads today?', source: 'telegram' },
  { ago: 60, kind: 'cron.ok', title: 'Lead digest', detail: 'delivered', source: 'cron' },
  { ago: 106, kind: 'cron.fail', title: 'Weekly campaign report', detail: 'RuntimeError: quota exceeded', source: 'cron' },
  { ago: 130, kind: 'cron.ok', title: 'Lead digest', detail: 'nothing to send', source: 'cron' },
  { ago: 150, kind: 'task.finished', title: 'Reconcile the paper invoices', source: 'kanban' },
  { ago: 200, kind: 'error', title: 'crm: rate limited, retrying', detail: '2 times', count: 2, source: 'log' },
  { ago: 240, kind: 'cron.ok', title: 'Lead digest', detail: 'delivered', source: 'cron' },
  { ago: 300, kind: 'session.started', title: 'Direct chat', source: 'telegram' },
];

function generic(snapshot: OfficeSnapshot, person: Person): Ev[] {
  const presence = snapshot.presence[person.id];
  const now = Date.parse(snapshot.generatedAt);
  const minsAgo = (iso?: string) => (iso ? Math.max(1, Math.round((now - Date.parse(iso)) / 60_000)) : 30);
  const jobs = (snapshot.jobs?.[person.id] ?? []).filter((j) => j.lastRunAt && minsAgo(j.lastRunAt) < 600).map((j): Ev => ({
    ago: minsAgo(j.lastRunAt), kind: j.lastStatus && j.lastStatus !== 'ok' ? 'cron.fail' : 'cron.ok', title: j.name,
    detail: j.lastStatus && j.lastStatus !== 'ok' ? j.lastStatus : 'delivered', source: 'cron',
  }));
  const tasks = snapshot.tasks.filter((t) => t.ownerId === person.id).map((t): Ev => ({
    ago: minsAgo(t.updatedAt), kind: t.status === 'done' ? 'task.finished' : t.status === 'blocked' ? 'task.blocked' : t.status === 'doing' ? 'task.started' : 'task.created',
    title: t.title, source: 'kanban',
  }));
  const activity: Ev[] = presence?.activity ? [{ ago: minsAgo(presence.since), kind: 'tool.call', title: presence.activity, detail: '6 tool calls', count: 6, source: 'telegram' }] : [];
  return [
    ...activity, ...jobs, ...tasks,
    { ago: 95, kind: 'message.out', title: 'Done. The summary is in your inbox.', source: 'telegram' },
    { ago: 97, kind: 'message.in', title: '[Jan] Can you send me the summary?', source: 'telegram' },
    { ago: 320, kind: 'session.started', title: 'Direct chat', source: 'telegram' },
  ];
}

export function demoTimeline(snapshot: OfficeSnapshot, personId: string): TimelineResponse {
  const person = snapshot.people.find((p) => p.id === personId);
  const now = Date.parse(snapshot.generatedAt);
  const since = new Date(now - 86_400_000).toISOString();
  if (!person?.bot) return { personId, available: false, reason: 'No bot yet', since, events: [], truncated: false };
  const script = personId === 'dwight' ? DWIGHT : generic(snapshot, person);
  const events = [...script].sort((a, b) => a.ago - b.ago).map(({ ago, ...e }, i): TimelineEvent => ({ ...e, id: `demo-${personId}-${i}`, at: new Date(now - ago * 60_000).toISOString() }));
  return { personId, adapter: { id: 'hermes', label: 'Hermes' }, available: true, since, events, truncated: false };
}

// Per bot: a model, tokens per day (in, out, cache reads) and its price per million tokens (null = unpriced).
const SEEDS: Readonly<Record<string, readonly [string, number, number, number, readonly [number, number, number] | null]>> = {
  campaigns: ['MiniMax-M3', 1_400_000, 90_000, 9_000_000, [0.3, 1.2, 0.06]],
  chief: ['claude-opus-5-5', 260_000, 38_000, 2_100_000, [4, 20, 0.2]],
  social: ['claude-sonnet-5', 120_000, 26_000, 1_500_000, [2, 10, 0.2]],
  tech: ['MiniMax-M3.1-Flash-Preview', 2_600_000, 120_000, 14_000_000, null],
  cmo: ['claude-sonnet-5', 40_000, 9_000, 300_000, [2, 10, 0.2]],
  cfo: ['claude-opus-5-5', 30_000, 6_000, 220_000, [4, 20, 0.2]],
  skool: ['MiniMax-M3', 300_000, 20_000, 1_800_000, [0.3, 1.2, 0.06]],
  general: ['gpt-6-luna', 500_000, 40_000, 0, [0, 0, 0]],
  health: ['claude-haiku-5-5', 90_000, 12_000, 400_000, [0.1, 0.5, 0.01]],
  teacher: ['claude-sonnet-5', 25_000, 5_000, 120_000, [2, 10, 0.2]],
  strategist: ['claude-fable-5-1', 18_000, 6_000, 90_000, [10, 50, 0.25]],
  'ai-strategist': ['claude-opus-5-5', 22_000, 5_000, 140_000, [4, 20, 0.2]],
};
const DAYS: Readonly<Record<UsagePeriod, number>> = { today: 0.45, '7d': 6.3, '30d': 27.5 };

function summaryOf(models: readonly ModelUsage[]): UsageSummary {
  const sum = (k: 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens') => models.reduce((n, m) => n + m[k], 0);
  const priced = models.filter((m) => m.cost !== null);
  const unpricedModels = [...new Set(models.filter((m) => m.cost === null).map((m) => m.model))];
  return {
    inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), cacheReadTokens: sum('cacheReadTokens'), cacheWriteTokens: sum('cacheWriteTokens'),
    cost: priced.length || !unpricedModels.length ? Math.round(priced.reduce((n, m) => n + (m.cost ?? 0), 0) * 1e6) / 1e6 : null, unpricedModels, models: [...models],
  };
}

export function demoUsage(snapshot: OfficeSnapshot, period: UsagePeriod): UsageReport {
  const now = Date.parse(snapshot.generatedAt);
  const rows = snapshot.people.filter((p) => p.bot && SEEDS[p.bot.profile]).map((p): UsageRow => {
    const [model, inDay, outDay, crDay, price] = SEEDS[p.bot!.profile]!;
    const k = DAYS[period];
    const t = { inputTokens: Math.round(inDay * k), outputTokens: Math.round(outDay * k), cacheReadTokens: Math.round(crDay * k), cacheWriteTokens: 0 };
    const cost = price ? Math.round(((t.inputTokens * price[0] + t.outputTokens * price[1] + t.cacheReadTokens * price[2]) / 1e6) * 1e6) / 1e6 : null;
    const m: ModelUsage = { model, ...t, cost, costSource: price ? (price[0] === 0 ? 'included' : 'price-table') : 'unpriced' };
    return { personId: p.id, name: p.name, adapterId: 'hermes', adapterLabel: 'Hermes', usage: summaryOf([m]) };
  });
  const days = period === 'today' ? 0 : period === '7d' ? 7 : 30;
  return {
    period, from: new Date(now - (days || 0.45) * 86_400_000).toISOString(), to: snapshot.generatedAt, generatedAt: snapshot.generatedAt, currency: 'USD', estimate: true,
    priceTable: { asOf: '2026-10-06', source: 'Demo prices', models: 11 },
    rows, totals: summaryOf(rows.flatMap((r) => r.usage?.models ?? [])),
  };
}
