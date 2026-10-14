// Claude Code http hook payloads (code.claude.com/docs/en/hooks) -> what the office shows. Pure.
// parseHook keeps only display-safe bits: the session id, the event, the project folder's NAME (never the path),
// the tool name and a short summary (a file's base name, Bash's own description, a URL's host). Prompts, commands,
// tool input and output, transcript paths and cwd are dropped on the spot.
import type { BotStatus } from '../../../../shared/contract.ts';
import { isRecord, str } from '../../hermes/guards.ts';
import { scrubText } from '../../domain/scrub.ts';
import { permissionAsk } from './permission.ts';

export type Hook = {
  readonly sessionId: string;
  readonly event: string;
  readonly project: string; // last folder of cwd, e.g. 'paper-site'
  readonly tool?: string;
  readonly detail?: string; // file base name, Bash description, URL host, subagent type, MCP server
  readonly notification?: string; // Notification: notification_type
  readonly message?: string; // Notification: its one-line message
  readonly agentType?: string; // SubagentStart/Stop
  readonly error?: string; // StopFailure: error type
  readonly interrupted?: boolean; // PostToolUseFailure: is_interrupt
  readonly finalText?: string; // Stop: Claude's last message
  readonly ask?: string; // PermissionRequest: the command, file or URL it asks for (permission.ts)
};

export type HookEffect = {
  readonly status?: { readonly status: BotStatus; readonly activity?: string };
  readonly message?: string; // goes to the session's direct line
  readonly ended?: true;
};

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const EVENT = /^[A-Za-z]{1,40}$/;
const TOOL = /^[A-Za-z0-9_.:-]{1,80}$/;
const WORD = /^[A-Za-z0-9_ .:-]{1,40}$/;
const FINAL_TEXT_MAX = 2000;
const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'NotebookRead']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SEARCH_TOOLS = new Set(['Grep', 'Glob', 'LS', 'ToolSearch']);
const ASKING = new Set(['permission_prompt', 'elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input']);

function oneLine(value: unknown, max: number): string | undefined {
  const text = typeof value === 'string' ? scrubText(value.replace(/\s+/g, ' ').trim()) : '';
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const lastSegment = (p: string): string => p.split(/[\\/]+/).filter(Boolean).pop() ?? '';

function hostOf(url: unknown): string | undefined {
  try {
    return typeof url === 'string' ? new URL(url).hostname || undefined : undefined;
  } catch {
    return undefined;
  }
}

function toolDetail(tool: string, input: unknown): string | undefined {
  const i = isRecord(input) ? input : {};
  if (FILE_TOOLS.has(tool)) return oneLine(lastSegment(str(i.file_path ?? i.notebook_path, 1000) ?? ''), 60);
  if (tool === 'Bash') return oneLine(i.description, 80);
  if (tool === 'WebFetch') return hostOf(i.url);
  if (tool === 'Task' || tool === 'Agent') return oneLine(i.subagent_type, 40);
  if (tool.startsWith('mcp__')) return oneLine(tool.split('__')[1], 40);
  return undefined;
}

function compact<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export function parseHook(body: unknown): { ok: true; hook: Hook } | { ok: false; error: string } {
  if (!isRecord(body)) return { ok: false, error: 'The body must be a JSON object' };
  const sessionId = typeof body.session_id === 'string' && SESSION_ID.test(body.session_id) ? body.session_id : null;
  const event = typeof body.hook_event_name === 'string' && EVENT.test(body.hook_event_name) ? body.hook_event_name : null;
  if (!sessionId || !event) return { ok: false, error: 'session_id and hook_event_name are required' };
  const tool = typeof body.tool_name === 'string' && TOOL.test(body.tool_name) ? body.tool_name : undefined;
  const word = (v: unknown) => (typeof v === 'string' && WORD.test(v) ? v : undefined);
  const hook: Hook = compact({
    sessionId, event,
    project: oneLine(lastSegment(str(body.cwd, 4096) ?? ''), 60) ?? 'claude-code',
    tool, detail: tool ? toolDetail(tool, body.tool_input) : undefined,
    notification: word(body.notification_type), message: event === 'Notification' ? oneLine(body.message, 120) : undefined,
    agentType: word(body.agent_type), error: word(body.error),
    interrupted: body.is_interrupt === true ? true : undefined,
    ask: event === 'PermissionRequest' && tool ? permissionAsk(tool, body.tool_input, str(body.cwd, 4096) ?? '') : undefined,
    finalText: event === 'Stop' && typeof body.last_assistant_message === 'string'
      ? scrubText(body.last_assistant_message.trim()).slice(0, FINAL_TEXT_MAX) || undefined : undefined,
  });
  return { ok: true, hook };
}

/** A lower-case slug of the project name for agent ids (max 24 characters, so a "-2" suffix still fits in 28). */
export function projectSlug(project: string): string {
  const slug = project.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/, '');
  return slug || 'session';
}

/** "Reading checkout.ts", "Running: Run the tests", "Searching the code", ... */
export function describeTool(hook: Hook): string {
  const tool = hook.tool ?? 'a tool';
  const d = hook.detail;
  if (FILE_TOOLS.has(tool)) return `${EDIT_TOOLS.has(tool) ? 'Editing' : 'Reading'} ${d ?? 'a file'}`;
  if (tool === 'Bash') return d ? `Running: ${d}` : 'Running a command';
  if (SEARCH_TOOLS.has(tool)) return 'Searching the code';
  if (tool === 'WebFetch') return d ? `Fetching ${d}` : 'Fetching a page';
  if (tool === 'WebSearch') return 'Searching the web';
  if (tool === 'Task' || tool === 'Agent') return d ? `Delegating to ${d}` : 'Delegating to a subagent';
  if (tool.startsWith('mcp__')) return `Using ${d ?? 'an MCP tool'} (MCP)`;
  return `Using ${tool}`;
}

/** The hook asks you something (a permission request or an asking notification): it doesn't move the session on. */
export function isAsking(hook: Hook): boolean {
  return hook.event === 'PermissionRequest' || (hook.event === 'Notification' && hook.notification !== undefined && ASKING.has(hook.notification));
}

const status = (s: BotStatus, activity?: string): HookEffect['status'] => (activity ? { status: s, activity } : { status: s });
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

function notificationEffect(hook: Hook): HookEffect {
  if (hook.notification && ASKING.has(hook.notification)) {
    return { status: status('needs-input', hook.notification === 'permission_prompt' ? (hook.message ?? 'Needs your permission') : 'Has a question for you') };
  }
  if (hook.notification === 'idle_prompt') return { status: status('idle', 'Waiting for your next prompt') };
  if (hook.notification === 'agent_completed') return { status: status('idle') };
  return {};
}

export function hookEffect(hook: Hook, previousActivity?: string): HookEffect {
  switch (hook.event) {
    case 'SessionStart': return { status: status('idle', 'Session started') };
    case 'UserPromptSubmit': return { status: status('working', 'Working on your prompt') };
    case 'PreToolUse': return { status: status('working', describeTool(hook)) };
    case 'PostToolUse': return { status: status('working', previousActivity ?? describeTool(hook)) };
    case 'PostToolUseFailure':
      return { status: hook.interrupted ? status('idle', 'Interrupted') : status('working', `${hook.tool ?? 'A tool'} failed`) };
    case 'PermissionRequest':
      return { status: status('needs-input', `Needs permission for ${hook.tool ?? 'a tool'}${hook.detail ? ` (${hook.detail})` : ''}`) };
    case 'Notification': return notificationEffect(hook);
    case 'SubagentStart': return { status: status('working', hook.agentType ? `Running ${article(hook.agentType)} ${hook.agentType} subagent` : 'Running a subagent') };
    case 'SubagentStop': return { status: status('working', `${hook.agentType ?? 'A'} subagent finished`) };
    case 'Stop': return { status: status('idle'), ...(hook.finalText ? { message: hook.finalText } : {}) };
    case 'StopFailure': return { status: status('error', `Stopped: ${hook.error ?? 'an API error'}`) };
    case 'SessionEnd': return { status: status('offline', 'Session ended'), ended: true };
    default: return {};
  }
}
