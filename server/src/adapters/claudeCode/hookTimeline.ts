// A Claude Code hook (hookMap.ts) -> the timeline event it stands for, or null for the ones that add nothing
// (PostToolUse repeats its PreToolUse, SubagentStop, idle notifications). Prompts are never shown: a submitted
// prompt is just "You sent a prompt". Claude's answer is one short scrubbed line.
import { oneLine } from '../../domain/oneLine.ts';
import { describeTool, type Hook } from './hookMap.ts';
import type { NewTimelineEvent } from '../ingest/timelineLog.ts';

const ASKING = new Set(['permission_prompt', 'elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input']);
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

type Draft = Omit<NewTimelineEvent, 'at' | 'source'>;

function draft(hook: Hook): Draft | null {
  switch (hook.event) {
    case 'SessionStart': return { kind: 'session.started', title: `Session started in ${hook.project}` };
    case 'SessionEnd': return { kind: 'session.ended', title: `Session ended in ${hook.project}` };
    case 'UserPromptSubmit': return { kind: 'message.in', title: 'You sent a prompt' };
    case 'PreToolUse': return { kind: 'tool.call', title: describeTool(hook), ...(hook.tool ? { detail: hook.tool } : {}) };
    case 'PostToolUseFailure':
      return hook.interrupted ? { kind: 'status', title: 'Interrupted' } : { kind: 'error', title: `${hook.tool ?? 'A tool'} failed` };
    case 'PermissionRequest':
      return { kind: 'status', title: `Needs permission for ${hook.tool ?? 'a tool'}`, ...(hook.detail ? { detail: hook.detail } : {}) };
    case 'Notification':
      return hook.notification && ASKING.has(hook.notification)
        ? { kind: 'status', title: 'Needs your input', ...(hook.message ? { detail: hook.message } : {}) }
        : null;
    case 'SubagentStart':
      return { kind: 'tool.call', title: hook.agentType ? `Running ${article(hook.agentType)} ${hook.agentType} subagent` : 'Running a subagent' };
    case 'Stop': return { kind: 'message.out', title: hook.finalText ?? 'Finished its turn' };
    case 'StopFailure': return { kind: 'error', title: `Stopped: ${hook.error ?? 'an API error'}` };
    default: return null;
  }
}

export function timelineOfHook(hook: Hook, atMs: number, source: string): NewTimelineEvent | null {
  const d = draft(hook);
  if (!d) return null;
  return { ...d, title: oneLine(d.title), ...(d.detail ? { detail: oneLine(d.detail) } : {}), at: new Date(atMs).toISOString(), source };
}
