// Claude Code sessions can be stopped from the office through the hooks protocol: the answer to the session's next
// PreToolUse / PostToolUse hook is {"continue": false, "stopReason": …}, which ends Claude's turn. There is no pause:
// hooks can end a turn but cannot hold or resume a session.
import { describe, expect, it } from 'vitest';
import { createClaudeCodeAdapter } from '../../src/adapters/claudeCode/adapter.ts';
import type { AgentAdapter } from '../../src/adapters/types.ts';
import { answerNow } from './contractSuite.ts';

const TOKEN = 'test-ingest-token-0123456789abcdef';
const T0 = Date.parse('2026-10-13T15:00:00.000Z');
const S = 'session-aaaa-1111';
const hook = (a: AgentAdapter, event: string, extra: Record<string, unknown> = {}) =>
  answerNow(a.routes![0]!.handle({ params: [], body: { session_id: S, cwd: '/home/dev/paper-site', hook_event_name: event, ...extra } }));

function setup() {
  let t = T0;
  const adapter = createClaudeCodeAdapter({ token: TOKEN, now: () => t });
  return { adapter, tick: (ms: number) => { t += ms; } };
}

describe('stopping a Claude Code session', () => {
  it('declares stop and not pause', () => {
    const { adapter } = setup();
    expect(adapter.capabilities).toMatchObject({ pause: false, stop: true, runJob: false, reassign: false });
    expect(adapter.pause).toBeUndefined();
  });

  it('answers the next tool hook with continue: false, once, and shows the session stopped', async () => {
    const { adapter } = setup();
    hook(adapter, 'PreToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test', description: 'Run the tests' } });
    expect(await adapter.stop!('paper-site')).toEqual({ ok: true, value: { note: 'Claude Code stops at its next tool step (hooks cannot cut a reply short).' } });
    expect(hook(adapter, 'Notification', { notification_type: 'idle_prompt', message: 'waiting' })).toEqual({ status: 204 }); // notifications can't stop it
    expect(hook(adapter, 'PostToolUse', { tool_name: 'Bash' })).toEqual({ status: 200, body: { continue: false, stopReason: 'Stopped from Dunder Mifflin OS' } });
    expect((await adapter.snapshot()).presence['paper-site']).toMatchObject({ status: 'idle', activity: 'Stopped from the office' });
    expect(hook(adapter, 'PreToolUse', { tool_name: 'Read', tool_input: { file_path: '/home/dev/paper-site/a.ts' } })).toEqual({ status: 204 });
  });

  it('refuses a session that is not working, or unknown', async () => {
    const { adapter } = setup();
    hook(adapter, 'PreToolUse', { tool_name: 'Read', tool_input: { file_path: '/x/a.ts' } });
    hook(adapter, 'Stop', { last_assistant_message: 'Done.' });
    expect(await adapter.stop!('paper-site')).toEqual({ ok: false, status: 409, error: 'Nothing to stop: that session is not working' });
    expect(await adapter.stop!('nobody')).toEqual({ ok: false, status: 409, error: 'Nothing to stop: that session is not working' });
    expect(hook(adapter, 'UserPromptSubmit', { prompt: 'next' })).toEqual({ status: 204 });
  });

  it('lets a stop request lapse when no tool hook comes within two minutes', async () => {
    const { adapter, tick } = setup();
    hook(adapter, 'PreToolUse', { tool_name: 'Read', tool_input: { file_path: '/x/a.ts' } });
    expect(await adapter.stop!('paper-site')).toMatchObject({ ok: true });
    tick(121_000);
    expect(hook(adapter, 'PostToolUse', { tool_name: 'Read' })).toEqual({ status: 204 });
  });
});
