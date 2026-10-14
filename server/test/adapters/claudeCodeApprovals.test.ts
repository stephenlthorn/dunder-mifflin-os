// Claude Code permission prompts in the approvals inbox. PermissionRequest can answer allow/deny synchronously, so
// with `decisions` on (config `decide: true` + DMOS_ALLOW_WRITES) the hook is held until you decide, the hold runs
// out, Claude Code hangs up or the session moves on. Otherwise (and for Notification prompts) the item is shown only.
import { describe, expect, it } from 'vitest';
import { createClaudeCodeAdapter } from '../../src/adapters/claudeCode/adapter.ts';
import type { AgentAdapter, InboundResponse } from '../../src/adapters/types.ts';
import { DIRTY } from './contractSuite.ts';
import { LEAK_PATTERNS } from '../helpers/leakScan.ts';

const TOKEN = 'test-ingest-token-0123456789abcdef';
const T0 = Date.parse('2026-10-13T15:00:00.000Z');
const CWD = '/home/dev/paper-site';
const send = (a: AgentAdapter, body: unknown, signal?: AbortSignal) => a.routes![0]!.handle({ params: [], body, ...(signal ? { signal } : {}) });
const ev = (event: string, extra: Record<string, unknown> = {}, session = 's-1') => ({ session_id: session, cwd: CWD, hook_event_name: event, ...extra });
const bash = (command: string, description = 'Run the tests') => ev('PermissionRequest', { tool_name: 'Bash', tool_input: { command, description }, permission_mode: 'default' });
const tick = () => new Promise((r) => setTimeout(r, 0));
const ALLOW = { status: 200, body: { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } } };

function deciding(holdMs = 60_000) {
  return createClaudeCodeAdapter({ token: TOKEN, now: () => T0, decisions: true, holdMs });
}

describe('claude-code permission prompts as approvals', () => {
  it('declares the approvals capability', () => {
    const adapter = createClaudeCodeAdapter({ token: TOKEN });
    expect(adapter.capabilities.approvals).toBe(true);
    expect(typeof adapter.listApprovals).toBe('function');
    expect(typeof adapter.resolveApproval).toBe('function');
  });

  it('shows a permission request without holding it when decisions are off (the default)', async () => {
    const adapter = createClaudeCodeAdapter({ token: TOKEN, now: () => T0 });
    expect(send(adapter, bash('npm test -- --run'))).toEqual({ status: 204 });
    const [item] = await adapter.listApprovals!();
    expect(item).toMatchObject({
      agentId: 'paper-site', kind: 'permission', title: 'Run a command: Run the tests', detail: 'npm test -- --run', risk: 'high', decidable: false,
      requestedAt: new Date(T0).toISOString(),
    });
    expect((await adapter.snapshot()).approvals).toEqual([item]);
    expect(await adapter.resolveApproval!(item!.id, { approve: true })).toMatchObject({ ok: false, status: 409 });
  });

  it('holds the hook until you approve, then answers allow and stops asking', async () => {
    const adapter = deciding();
    const answer = send(adapter, bash('npm test'));
    expect(answer).toBeInstanceOf(Promise);
    const [item] = await adapter.listApprovals!();
    expect(item).toMatchObject({ decidable: true, actions: { approve: 'Allow it once', reject: 'Deny it (your note goes to Claude)' } });
    expect((await adapter.snapshot()).presence['paper-site']).toMatchObject({ status: 'needs-input' });
    expect(await adapter.resolveApproval!(item!.id, { approve: true })).toEqual({ ok: true, value: null });
    expect(await answer).toEqual(ALLOW);
    expect(await adapter.listApprovals!()).toEqual([]);
    expect((await adapter.snapshot()).presence['paper-site']).toMatchObject({ status: 'working', activity: 'Allowed: Run a command: Run the tests' });
    expect(await adapter.resolveApproval!(item!.id, { approve: true })).toMatchObject({ ok: false, status: 404 });
  });

  it('answers deny with your note as the reason Claude sees', async () => {
    const adapter = deciding();
    const answer = send(adapter, ev('PermissionRequest', { tool_name: 'Write', tool_input: { file_path: `${CWD}/src/checkout.ts`, content: 'x' } }));
    const [item] = await adapter.listApprovals!();
    expect(item).toMatchObject({ title: 'Write checkout.ts', detail: 'src/checkout.ts', risk: 'medium' });
    await adapter.resolveApproval!(item!.id, { approve: false, note: 'use the existing helper' });
    expect(await answer).toEqual({ status: 200, body: { hookSpecificOutput: { hookEventName: 'PermissionRequest',
      decision: { behavior: 'deny', message: 'Rejected in Dunder Mifflin OS: use the existing helper' } } } });
  });

  it('lets Claude Code ask in the terminal when the hold runs out', async () => {
    const adapter = deciding(20);
    const answer = send(adapter, bash('npm test')) as Promise<InboundResponse>;
    expect(await answer).toEqual({ status: 204 });
    expect(await adapter.listApprovals!()).toEqual([]);
  });

  it('drops a held request when Claude Code hangs up', async () => {
    const adapter = deciding();
    const hangUp = new AbortController();
    const answer = send(adapter, bash('npm test'), hangUp.signal) as Promise<InboundResponse>;
    hangUp.abort();
    expect(await answer).toEqual({ status: 204 });
    expect(await adapter.listApprovals!()).toEqual([]);
  });

  it('clears what a session asked once it moves on, but a Notification about the same prompt keeps it', async () => {
    const adapter = deciding();
    const answer = send(adapter, bash('npm test')) as Promise<InboundResponse>;
    send(adapter, ev('Notification', { notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' }));
    expect(await adapter.listApprovals!()).toHaveLength(1);
    send(adapter, ev('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test' } }));
    expect(await answer).toEqual({ status: 204 });
    expect(await adapter.listApprovals!()).toEqual([]);
  });

  it('shows a Notification prompt with nothing held as answer-in-Claude-Code, until the session moves on', async () => {
    const adapter = deciding();
    send(adapter, ev('Notification', { notification_type: 'elicitation_dialog', message: 'Which database?' }));
    expect(await adapter.listApprovals!()).toEqual([expect.objectContaining({ kind: 'question', title: 'Has a question for you', decidable: false })]);
    send(adapter, ev('UserPromptSubmit'));
    expect(await adapter.listApprovals!()).toEqual([]);
  });

  it('replaces an older held request from the same session and answers it without a decision', async () => {
    const adapter = deciding();
    const first = send(adapter, bash('npm test')) as Promise<InboundResponse>;
    const second = send(adapter, bash('npm run lint', 'Lint')) as Promise<InboundResponse>;
    expect(await first).toEqual({ status: 204 });
    expect((await adapter.listApprovals!()).map((a) => a.detail)).toEqual(['npm run lint']);
    await adapter.close!();
    expect(await second).toEqual({ status: 204 });
    await tick();
  });

  it('never lets a secret or a home path into the request it shows', async () => {
    const adapter = createClaudeCodeAdapter({ token: TOKEN, now: () => T0 });
    send(adapter, ev('PermissionRequest', { tool_name: 'Bash', tool_input: { command: `curl -H "Authorization: Bearer abcdefghijklmnopqrstuvwxyz" ${DIRTY.token} ${DIRTY.path}`, description: DIRTY.phone } }, 'dirty'));
    send(adapter, { session_id: 'dirty-2', cwd: '/Users/jane.doe/elsewhere', hook_event_name: 'PermissionRequest', tool_name: 'Edit', tool_input: { file_path: '/Users/jane.doe/.ssh/config' } });
    send(adapter, ev('PermissionRequest', { tool_name: 'WebFetch', tool_input: { url: 'https://api.example.com/v1/items?api_key=sk-ant-api03-abcdefghijklmnopqrstuvwxyz' } }, 'dirty-3'));
    const text = JSON.stringify(await adapter.listApprovals!());
    expect(LEAK_PATTERNS.filter(([, re]) => re.test(text)).map(([k]) => k)).toEqual([]);
    expect(text).toContain('https://api.example.com/v1/items');
    expect(text).not.toContain('api_key');
  });
});
