// What a Claude Code PermissionRequest asks for, in words you can approve: a title ("Run a command: Run the tests"),
// the thing itself (the command, a file path relative to the project, a URL without its query) and a risk. You can't
// approve what you can't see, so unlike other hooks the command is kept here: scrubbed, one line, capped, in memory
// only while the request is pending, and never logged.
import type { ApprovalRisk } from '../../../../shared/contract.ts';
import { isRecord, str } from '../../hermes/guards.ts';
import { scrubText } from '../../domain/scrub.ts';

const ASK_MAX = 400;
const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'NotebookRead']);
const LOW_RISK = new Set(['Read', 'NotebookRead', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch', 'ToolSearch']);

// Secrets people put in commands, beyond what scrubText knows: VAR=value for secret-looking names, --password/--token
// style flags, curl -u user:pass, Authorization headers, user:pass@ in URLs and Stripe-style keys.
const COMMAND_SECRETS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS|AUTH|CREDENTIALS?)[A-Za-z0-9_]*)=("[^"]*"|'[^']*'|\S+)/gi, '$1=[secret]'],
  [/(--?(?:password|passwd|pass|token|secret|api[-_]?key|key|auth)(?:=|\s+))("[^"]*"|'[^']*'|\S+)/gi, '$1[secret]'],
  [/(\s-u\s+)("[^"]*"|'[^']*'|\S+)/g, '$1[secret]'],
  [/(Authorization:\s*\w+\s+)[^\s"']+/gi, '$1[secret]'],
  [/(\/\/)[^\s/@:]+:[^\s/@]+@/g, '$1[secret]@'],
  [/\b[rsp]k_(?:live|test)_\w+/g, '[secret]'],
];

const maskCommand = (text: string): string => COMMAND_SECRETS.reduce((acc, [re, to]) => acc.replace(re, to), text);

function line(value: unknown, max = ASK_MAX): string | undefined {
  const text = typeof value === 'string' ? scrubText(maskCommand(value.replace(/\s+/g, ' ').trim())) : '';
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function filePath(raw: unknown, cwd: string): string | undefined {
  const p = str(raw, 4096);
  if (!p) return undefined;
  const base = cwd.replace(/[\\/]+$/, '');
  return line(base && p.startsWith(`${base}/`) ? p.slice(base.length + 1) : p, 200);
}

function urlWithoutQuery(raw: unknown): string | undefined {
  try {
    const url = typeof raw === 'string' ? new URL(raw) : null;
    return url && /^https?:$/.test(url.protocol) ? line(`${url.origin}${url.pathname}`, 300) : undefined;
  } catch {
    return undefined;
  }
}

/** The thing being asked for, from the hook's tool_input. */
export function permissionAsk(tool: string, input: unknown, cwd: string): string | undefined {
  const i = isRecord(input) ? input : {};
  if (tool === 'Bash') return line(i.command);
  if (FILE_TOOLS.has(tool)) return filePath(i.file_path ?? i.notebook_path, cwd);
  if (tool === 'WebFetch') return urlWithoutQuery(i.url);
  if (tool === 'WebSearch') return line(i.query, 200);
  if (tool === 'Task' || tool === 'Agent') return line(i.description, 200);
  if (tool.startsWith('mcp__')) return line(tool.split('__').slice(1).join(' → '), 120);
  return undefined;
}

export function permissionRisk(tool: string): ApprovalRisk {
  if (tool === 'Bash') return 'high';
  return LOW_RISK.has(tool) ? 'low' : 'medium';
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/** "Run a command: Run the tests", "Write checkout.ts", "Fetch example.com", ... (`detail` is the hook's short detail). */
export function permissionTitle(tool: string | undefined, detail: string | undefined): string {
  const t = tool ?? 'a tool';
  if (t === 'Bash') return detail ? `Run a command: ${detail}` : 'Run a command';
  if (t === 'Write') return `Write ${detail ?? 'a file'}`;
  if (FILE_TOOLS.has(t)) return `${t.startsWith('Read') || t === 'NotebookRead' ? 'Read' : 'Edit'} ${detail ?? 'a file'}`;
  if (t === 'WebFetch') return detail ? `Fetch ${detail}` : 'Fetch a page';
  if (t === 'WebSearch') return 'Search the web';
  if (t === 'Task' || t === 'Agent') return detail ? `Start ${article(detail)} ${detail} subagent` : 'Start a subagent';
  if (t.startsWith('mcp__')) return `Use ${detail ?? 'an MCP tool'} (MCP)`;
  return `Use ${t}`;
}
