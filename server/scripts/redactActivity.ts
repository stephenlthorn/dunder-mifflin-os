// Scrubs live timeline/usage records into fixture data: keeps timestamps, counts, outcomes, model names and token
// numbers; replaces every id, title, job name, message and log text with synthetic values and generic tool names.
import { createHash } from 'node:crypto';
import type { HermesActivity, UsageRecord } from '../src/hermes/activityTypes.ts';

export const TASK_TITLES = [
  'Reconcile the paper invoices', 'Prep the quarterly sales deck', 'Order toner for the copier', 'Draft the client follow-up',
  'Plan the Dundies agenda', 'Audit the warehouse inventory', 'Update the price sheet', 'Write the safety training memo',
];
export const CRON_NAMES = ['Morning report', 'Lead digest', 'Inbox sweep', 'Weekly review', 'Health check', 'Evening wrap-up', 'Friday briefing', 'Backup check'];
const SESSION_TITLES: Readonly<Record<string, string>> = { telegram: 'Direct chat', cli: 'Terminal session', api: 'API session' };
export const SAID: Readonly<Record<'user' | 'assistant', ReadonlyArray<string>>> = {
  user: ['How are the numbers looking today?', 'Can you send me the summary?', 'Any replies from the prospects?', 'Good work. Keep going.'],
  assistant: ['Done. Three new leads, two follow-ups sent.', 'Summary sent to the Ops room.', 'Nothing new since this morning.', 'The report is ready for review.'],
};
const BUILT_IN_TOOLS = new Set([
  'terminal', 'read_file', 'write_file', 'patch', 'search_files', 'web_search', 'web_extract', 'skill_view', 'process_manage',
  'todo', 'memory', 'send_message', 'browser_navigate', 'browser_snapshot', 'vision_analyze', 'execute_code', 'delegate_task',
]);
const MCP_SERVERS = ['crm', 'mail', 'calendar', 'docs'];
const MCP_CALLS = ['list_items', 'get_item', 'search', 'update_item'];
const LOGGERS = new Set(['asyncio', 'gateway', 'gateway.run', 'telegram.ext', 'telegram.ext.Updater', 'tools.mcp', 'agent', 'cron']);
export const LOG_MESSAGES = ['Unclosed client session', 'Network retry loop gave up', 'MCP call failed', 'Request timed out', 'Delivery failed'];

const pick = <T>(list: ReadonlyArray<T>, key: string): T => list[parseInt(createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % list.length] as T;

export function genericTool(name: string): string {
  if (BUILT_IN_TOOLS.has(name)) return name;
  if (name.startsWith('mcp__')) return `mcp__${pick(MCP_SERVERS, name.split('__')[1] ?? name)}__${pick(MCP_CALLS, name)}`;
  return 'tool';
}

export function redactActivity(profile: string, a: HermesActivity): HermesActivity {
  const id = (kind: string, raw: string) => `fx-${kind}-${createHash('sha256').update(`${profile}:${raw}`).digest('hex').slice(0, 10)}`;
  const title = (raw: string) => pick(TASK_TITLES, raw);
  return {
    sessions: a.sessions.map((s) => ({ ...s, id: id('s', s.id), title: s.source ? (SESSION_TITLES[s.source] ?? null) : null })),
    messages: a.messages.map((m) => ({ ...m, id: id('m', m.id), text: pick(SAID[m.role], m.id) })),
    tools: a.tools.map((t) => ({
      ...t, sessionId: id('s', t.sessionId),
      tools: Object.entries(t.tools.reduce<Record<string, number>>((acc, x) => {
        const name = genericTool(x.name);
        return { ...acc, [name]: (acc[name] ?? 0) + x.count };
      }, {})).map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count),
    })),
    tasks: a.tasks.map((t) => ({ ...t, id: id('t', t.id), title: title(t.id) })),
    runs: a.runs.map((r) => ({ ...r, id: id('r', r.id), taskId: id('t', r.taskId), title: title(r.taskId) })),
    cron: a.cron.map((c) => ({
      ...c, id: id('c', c.id), jobId: id('j', c.jobId), jobName: pick(CRON_NAMES, c.jobId), error: c.error === null ? null : 'RuntimeError: the job failed',
    })),
    errors: a.errors.map((e) => ({ ...e, logger: LOGGERS.has(e.logger) ? e.logger : 'agent', message: pick(LOG_MESSAGES, `${e.logger}:${e.message}`) })),
  };
}

const PUBLIC_MODELS = /^(claude|gpt|o\d|minimax|glm|kimi|grok|qwen|gemini|llama|mistral|deepseek)[\w.-]*$/i;

/** Public model names stay (they decide the price); private or custom ones become 'custom-model'. */
export function publicModel(model: string): string {
  const name = model.trim().split(/\s+/)[0] ?? '';
  return PUBLIC_MODELS.test(name) ? name : 'custom-model';
}

/** Usage rows keep model names and numbers only. */
export function redactUsage(rows: ReadonlyArray<UsageRecord>): UsageRecord[] {
  return rows.map((r) => ({
    at: r.at, model: publicModel(r.model), inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens,
    cacheWriteTokens: r.cacheWriteTokens, reasoningTokens: r.reasoningTokens, ...(r.calls === undefined ? {} : { calls: r.calls }),
    ...(r.recordedCost ? { recordedCost: r.recordedCost } : {}),
  }));
}
