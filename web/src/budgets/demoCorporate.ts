// Demo mode ("Threat Level Midnight" data): the demo bots behave like Hermes bots for control verbs (stop, run a job
// now, reassign; no pause) and Corporate has a fictional budget report. Nothing here is sent anywhere.
import type { AgentCapabilities, OfficeSnapshot } from '@shared/contract';
import type { BudgetLine, BudgetStatus, BudgetsReport } from '@shared/controls';

const HERMES_CONTROLS: Pick<AgentCapabilities, 'pause' | 'stop' | 'runJob' | 'reassign'> = { pause: false, stop: true, runJob: true, reassign: true };
const BASE_CAPS: AgentCapabilities = { chat: true, createTask: true, approvals: true, pause: false, stop: false };

export function withDemoControls(s: OfficeSnapshot): OfficeSnapshot {
  const people = s.people.map((p) => (p.bot ? { ...p, bot: { ...p.bot, capabilities: { ...(p.bot.capabilities ?? BASE_CAPS), ...HERMES_CONTROLS } } } : p));
  const jobs = Object.fromEntries(Object.entries(s.jobs ?? {}).map(([id, list]) => [id, list.map((j, i) => ({ ...j, id: j.id ?? `demo-${id}-${i}` }))]));
  return { ...s, people, jobs };
}

const day = (s: OfficeSnapshot) => {
  const d = new Date(s.generatedAt);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};
const month = (s: OfficeSnapshot) => {
  const d = new Date(day(s));
  d.setDate(1);
  return d.toISOString();
};

export function demoBudgets(s: OfficeSnapshot): BudgetsReport {
  const line = (period: BudgetLine['period'], limit: number, spent: number | null, level: BudgetLine['level'], unpricedModels: string[] = []): BudgetLine => ({
    period, limit, spent, ratio: spent === null ? null : Math.round((spent / limit) * 1e6) / 1e6, level,
    from: period === 'daily' ? day(s) : month(s), to: s.generatedAt, unpricedModels,
  });
  const name = (id: string) => s.people.find((p) => p.id === id)?.name ?? id;
  const budgets: BudgetStatus[] = [
    { personId: 'kelly', name: name('kelly'), adapterLabel: 'Hermes', level: 'over', action: 'alert', note: "Hermes agents can't be paused; Corporate can only call you",
      lines: [line('daily', 2, 2.35, 'over'), line('monthly', 40, 31.2, 'ok')] },
    { personId: 'dwight', name: name('dwight'), adapterLabel: 'Hermes', level: 'warn', action: 'none', lines: [line('monthly', 20, 17.1, 'warn')] },
    { personId: 'andy', name: name('andy'), adapterLabel: 'Hermes', level: 'unpriced', action: 'none', lines: [line('monthly', 10, null, 'unpriced', ['pretzel-7b-local'])] },
  ];
  return { generatedAt: s.generatedAt, currency: 'USD', estimate: true, autoPause: false, warnAt: 0.8, budgets };
}

/** "Pause Dwight?" -> what the demo says instead of acting. */
export const demoControlReply = (title: string): string => {
  const what = title.replace(/[?…]+$/, '');
  return `Demo: nothing was sent. Live, this would: ${what.charAt(0).toLowerCase()}${what.slice(1)}.`;
};
