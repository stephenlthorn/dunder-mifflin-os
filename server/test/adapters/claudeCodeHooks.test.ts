// Claude Code http hook payloads -> what the office shows. Pure mapping, from recorded sample payloads.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hookEffect, parseHook, projectSlug } from '../../src/adapters/claudeCode/hookMap.ts';
import { HOOK_EVENTS, PERMISSION_TIMEOUT_S, claudeCodeHookSettings } from '../../src/adapters/claudeCode/settings.ts';
import { HOLD_SECONDS } from '../../src/officeConfig.ts';

const SESSION = JSON.parse(readFileSync(new URL('../fixtures/claude-code/session.json', import.meta.url), 'utf8')).payloads as Array<Record<string, unknown>>;
const byEvent = (name: string, n = 0) => SESSION.filter((p) => p.hook_event_name === name)[n]!;
const effectOf = (payload: Record<string, unknown>, previous?: string) => {
  const parsed = parseHook(payload);
  if (!parsed.ok) throw new Error(parsed.error);
  return hookEffect(parsed.hook, previous);
};

describe('parseHook', () => {
  it('keeps only what the office shows: session, event, project folder name and a short tool summary', () => {
    expect(parseHook(byEvent('PreToolUse', 1))).toEqual({
      ok: true,
      hook: { sessionId: '5f0c2a1e-7d3b-4c9a-9e21-0b6d8f4a2c11', event: 'PreToolUse', project: 'paper-site', tool: 'Bash', detail: 'Run the checkout tests' },
    });
    expect(parseHook(byEvent('PreToolUse', 0))).toMatchObject({ ok: true, hook: { tool: 'Read', detail: 'checkout.ts' } });
  });

  it('never keeps paths, prompts, commands or tool output, except the command a permission request asks for, secrets masked', () => {
    const parsed = SESSION.map((p) => parseHook(p));
    const kept = JSON.stringify(parsed.map((r) => (r.ok ? { ...r.hook, ask: undefined } : r)));
    for (const secret of ['/home/dev', 'transcript', 'sk-ant', 'sk_live', 'STRIPE_KEY', 'npm test', 'TOP-SECRET', 'Fix the failing']) {
      expect(kept, secret).not.toContain(secret);
    }
    expect(parsed.flatMap((r) => (r.ok && r.hook.ask ? [r.hook.ask] : []))).toEqual(['STRIPE_KEY=[secret] npm test -- checkout']);
  });

  it('masks secrets in the command a permission request shows', () => {
    const ask = (command: string) => parseHook({ session_id: 's', hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command } });
    const cases: Array<[string, string]> = [
      ['export API_TOKEN=abc123 && deploy', 'export API_TOKEN=[secret] && deploy'],
      ['curl -u admin:hunter2 https://x.example', 'curl -u [secret] https://x.example'],
      ['curl -H "Authorization: Basic dXNlcjpwYXNz" https://x.example', 'curl -H "Authorization: Basic [secret]" https://x.example'],
      ['git clone https://me:ghs_abcdef@github.com/o/r', 'git clone https://[secret]@github.com/o/r'],
      ['stripe charge --api-key rk_live_51abc', 'stripe charge --api-key [secret]'],
      ['mysql --password=pw1 -e "select 1"', 'mysql --password=[secret] -e "select 1"'],
      ['npm test', 'npm test'],
    ];
    for (const [command, shown] of cases) expect(ask(command), command).toMatchObject({ ok: true, hook: { ask: shown } });
  });

  it('refuses a payload without a usable session id or event name', () => {
    expect(parseHook({ hook_event_name: 'Stop' })).toMatchObject({ ok: false });
    expect(parseHook({ session_id: '../../etc', hook_event_name: 'Stop' })).toMatchObject({ ok: false });
    expect(parseHook({ session_id: 'abc', hook_event_name: 42 })).toMatchObject({ ok: false });
    expect(parseHook('nope')).toMatchObject({ ok: false });
  });

  it('names the project after the last folder of cwd, with a safe slug for the agent id', () => {
    expect(parseHook({ session_id: 'a', hook_event_name: 'Stop', cwd: 'C:\\Users\\dev\\Paper Site' })).toMatchObject({ hook: { project: 'Paper Site' } });
    expect(parseHook({ session_id: 'a', hook_event_name: 'Stop' })).toMatchObject({ hook: { project: 'claude-code' } });
    expect(projectSlug('Paper Site (v2)!')).toBe('paper-site-v2');
    expect(projectSlug('---')).toBe('session');
    expect(projectSlug('a'.repeat(60))).toHaveLength(24);
  });
});

describe('hookEffect (status rules)', () => {
  it('maps a whole recorded session: working while tools run, needs you on a permission prompt, idle on Stop', () => {
    let activity: string | undefined;
    const seen = SESSION.map((payload) => {
      const effect = effectOf(payload, activity);
      if (effect.status) activity = effect.status.activity;
      return [payload.hook_event_name, effect.status?.status ?? '-', effect.status?.activity ?? ''];
    });
    expect(seen).toEqual([
      ['SessionStart', 'idle', 'Session started'],
      ['UserPromptSubmit', 'working', 'Working on your prompt'],
      ['PreToolUse', 'working', 'Reading checkout.ts'],
      ['PostToolUse', 'working', 'Reading checkout.ts'],
      ['PreToolUse', 'working', 'Running: Run the checkout tests'],
      ['PermissionRequest', 'needs-input', 'Needs permission for Bash (Run the checkout tests)'],
      ['Notification', 'needs-input', 'Claude needs your permission to use Bash'],
      ['PostToolUseFailure', 'working', 'Bash failed'],
      ['SubagentStart', 'working', 'Running an Explore subagent'],
      ['PreToolUse', 'working', 'Searching the code'],
      ['SubagentStop', 'working', 'Explore subagent finished'],
      ['PreToolUse', 'working', 'Editing checkout.ts'],
      ['PostToolUse', 'working', 'Editing checkout.ts'],
      ['Stop', 'idle', ''],
      ['Notification', 'idle', 'Waiting for your next prompt'],
      ['SessionEnd', 'offline', 'Session ended'],
    ]);
  });

  it('posts Claude\'s final answer to the direct line on Stop, and ends the session on SessionEnd', () => {
    expect(effectOf(byEvent('Stop')).message).toBe('Fixed the checkout test: the price constant was off by one. Tests pass now.');
    expect(effectOf(byEvent('SessionEnd')).ended).toBe(true);
    expect(effectOf(byEvent('Stop')).ended).toBeUndefined();
  });

  it('covers interrupts, API failures, questions and tools it does not know', () => {
    const base = { session_id: 's1', cwd: '/x/proj' };
    expect(effectOf({ ...base, hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', is_interrupt: true }).status).toEqual({ status: 'idle', activity: 'Interrupted' });
    expect(effectOf({ ...base, hook_event_name: 'StopFailure', error: 'rate_limit' }).status).toEqual({ status: 'error', activity: 'Stopped: rate_limit' });
    expect(effectOf({ ...base, hook_event_name: 'Notification', notification_type: 'elicitation_dialog' }).status).toEqual({ status: 'needs-input', activity: 'Has a question for you' });
    expect(effectOf({ ...base, hook_event_name: 'PreToolUse', tool_name: 'mcp__github__create_pr', tool_input: {} }).status?.activity).toBe('Using github (MCP)');
    expect(effectOf({ ...base, hook_event_name: 'PreToolUse', tool_name: 'WebFetch', tool_input: { url: 'https://docs.example.com/a?token=x' } }).status?.activity).toBe('Fetching docs.example.com');
    expect(effectOf({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Frobnicate', tool_input: { secret: 'x' } }).status?.activity).toBe('Using Frobnicate');
    expect(effectOf({ ...base, hook_event_name: 'Notification', notification_type: 'auth_success' }).status).toBeUndefined();
    expect(effectOf({ ...base, hook_event_name: 'FileChanged' }).status).toBeUndefined();
  });
});

describe('claudeCodeHookSettings (the settings.json block in docs/adapters/claude-code.md)', () => {
  const settings = claudeCodeHookSettings('http://127.0.0.1:4318/api/hooks/claude-code');

  it('registers one http hook per event the adapter maps, sending the token from the environment', () => {
    expect(Object.keys(settings.hooks)).toEqual([...HOOK_EVENTS]);
    expect(settings.hooks.PreToolUse).toEqual([{
      hooks: [{
        type: 'http', url: 'http://127.0.0.1:4318/api/hooks/claude-code', timeout: 2,
        headers: { Authorization: 'Bearer $DMOS_INGEST_TOKEN' }, allowedEnvVars: ['DMOS_INGEST_TOKEN'],
      }],
    }]);
  });

  it('lets the PermissionRequest hook wait longer than the longest hold, so a decision in the office can still reach Claude Code', () => {
    const [entry] = settings.hooks.PermissionRequest as Array<{ hooks: Array<{ timeout: number }> }>;
    expect(entry?.hooks[0]?.timeout).toBe(PERMISSION_TIMEOUT_S);
    expect(PERMISSION_TIMEOUT_S).toBeGreaterThan(HOLD_SECONDS.max);
  });

  it('covers exactly the events hookEffect gives a status or message', () => {
    for (const event of HOOK_EVENTS) {
      const parsed = parseHook({ session_id: 's', hook_event_name: event, notification_type: 'permission_prompt', tool_name: 'Read', last_assistant_message: 'done' });
      expect(parsed.ok && (hookEffect(parsed.hook).status || hookEffect(parsed.hook).message), event).toBeTruthy();
    }
  });

  it('matches the snippet in the docs', () => {
    const doc = readFileSync(new URL('../../../docs/adapters/claude-code.md', import.meta.url), 'utf8');
    const block = /```json\n([\s\S]*?)\n```/.exec(doc)?.[1] ?? '';
    expect(JSON.parse(block)).toEqual(settings);
  });
});
