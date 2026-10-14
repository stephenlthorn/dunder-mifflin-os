import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { createClaudeCodeAdapter } from '../../src/adapters/claudeCode/adapter.ts';
import type { AgentAdapter } from '../../src/adapters/types.ts';
import { createApp, type App } from '../../src/http/app.ts';
import { defaultOfficeSetup } from '../../src/office/office.ts';
import { mergeSeatRules } from '../../src/office/seating.ts';
import type { OfficeSnapshot } from '../../../shared/contract.ts';
import { DIRTY, DIRTY_TEXT, answerNow, describeAdapterContract } from './contractSuite.ts';

const TOKEN = 'test-ingest-token-0123456789abcdef';
const T0 = Date.parse('2026-10-13T15:00:00.000Z');
const SESSION = JSON.parse(readFileSync(new URL('../fixtures/claude-code/session.json', import.meta.url), 'utf8')).payloads as Array<Record<string, unknown>>;
const UNTIL_STOP = SESSION.slice(0, SESSION.findIndex((p) => p.hook_event_name === 'Stop') + 1);
const hook = (a: AgentAdapter, body: unknown) => answerNow(a.routes![0]!.handle({ params: [], body }));
const other = (sessionId: string, event: string, extra: Record<string, unknown> = {}) =>
  ({ session_id: sessionId, cwd: '/home/dev/paper-site', hook_event_name: event, ...extra });

describeAdapterContract('claude-code', {
  make: async () => {
    let t = T0;
    const adapter = createClaudeCodeAdapter({ token: TOKEN, now: () => t });
    for (const p of UNTIL_STOP) hook(adapter, p);
    const dirty = { session_id: 'dirty-1', cwd: '/Users/jane.doe/secret-project' };
    hook(adapter, { ...dirty, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: DIRTY_TEXT, description: DIRTY.token } });
    hook(adapter, { ...dirty, hook_event_name: 'Notification', notification_type: 'permission_prompt', message: `${DIRTY.phone} ${DIRTY.path}` });
    hook(adapter, { ...dirty, hook_event_name: 'Stop', last_assistant_message: DIRTY_TEXT });
    return {
      adapter, token: TOKEN,
      feedMore: () => {
        t += 1000;
        hook(adapter, other('5f0c2a1e-7d3b-4c9a-9e21-0b6d8f4a2c11', 'UserPromptSubmit', { prompt: 'again' }));
      },
    };
  },
});

describe('claude-code sessions as characters', () => {
  it('replays a recorded session: needs you on the permission prompt, idle after Stop, Claude\'s answer in its direct line', async () => {
    const adapter = createClaudeCodeAdapter({ token: TOKEN, now: () => T0 });
    const statuses: string[] = [];
    for (const p of SESSION.slice(0, -1)) {
      expect(hook(adapter, p)).toEqual({ status: 204 });
      statuses.push((await adapter.snapshot()).presence['paper-site']?.status ?? '-');
    }
    expect(statuses).toEqual(['idle', 'working', 'working', 'working', 'working', 'needs-input', 'needs-input', 'working', 'working', 'working', 'working', 'working', 'working', 'idle', 'idle']);
    const snap = await adapter.snapshot();
    expect(snap.agents).toEqual([{ id: 'paper-site', name: 'paper-site', role: 'Claude Code session' }]);
    expect(snap.rooms).toEqual([{ id: 'claude-code-paper-site', name: 'Direct line', kind: 'dm', memberAgentIds: ['paper-site'] }]);
    const page = await adapter.readMessages('claude-code-paper-site', 10);
    expect(page?.messages.map((m) => m.text)).toEqual(['Fixed the checkout test: the price constant was off by one. Tests pass now.']);
    expect(JSON.stringify([snap, page])).not.toMatch(/home\/dev|sk-ant|sk_live|STRIPE|npm test|TOP-SECRET|Fix the failing/);
  });

  it('gives a second session in the same project its own character, and frees the name after the session ends', async () => {
    let t = T0;
    const adapter = createClaudeCodeAdapter({ token: TOKEN, now: () => t, endedGraceMs: 60_000 });
    hook(adapter, other('s-1', 'UserPromptSubmit'));
    hook(adapter, other('s-2', 'PreToolUse', { tool_name: 'Read', tool_input: { file_path: '/home/dev/paper-site/README.md' } }));
    let snap = await adapter.snapshot();
    expect(snap.presence['paper-site']).toMatchObject({ status: 'working', activity: 'Working on your prompt' });
    expect(snap.presence['paper-site-2']).toMatchObject({ status: 'working', activity: 'Reading README.md' });
    hook(adapter, other('s-1', 'SessionEnd', { reason: 'other' }));
    expect((await adapter.snapshot()).presence['paper-site']).toMatchObject({ status: 'offline', activity: 'Session ended' });
    t += 61_000;
    snap = await adapter.snapshot();
    expect(snap.agents.map((a) => a.id)).toEqual(['paper-site-2']);
    hook(adapter, other('s-3', 'SessionStart', { source: 'startup' }));
    expect((await adapter.snapshot()).agents.map((a) => a.id)).toEqual(['paper-site-2', 'paper-site']);
  });

  it('ignores events it does not show, refuses payloads without a session, and always answers without a decision', () => {
    const adapter = createClaudeCodeAdapter({ token: TOKEN, now: () => T0 });
    expect(hook(adapter, other('s-1', 'FileChanged'))).toEqual({ status: 204 });
    expect(hook(adapter, { hook_event_name: 'Stop' })).toMatchObject({ status: 400 });
    expect(hook(adapter, other('s-1', 'PermissionRequest', { tool_name: 'Bash', tool_input: {} }))).toEqual({ status: 204 });
  });

  it('rate-limits a runaway session', () => {
    const adapter = createClaudeCodeAdapter({ token: TOKEN, now: () => T0, maxEventsPerMinute: 2 });
    expect([1, 2, 3].map(() => hook(adapter, other('s-1', 'PreToolUse', { tool_name: 'Read' })).status)).toEqual([204, 204, 429]);
  });
});

describe('POST /api/hooks/claude-code over HTTP', () => {
  let app: App;
  let base: string;
  beforeAll(async () => {
    app = createApp({
      adapters: [createClaudeCodeAdapter({ token: TOKEN })],
      setup: defaultOfficeSetup(mergeSeatRules({}, { jim: { adapter: 'claude-code', agent: 'paper-site', role: 'Pair programmer' } })),
      hermesHome: '/nonexistent', headshotDir: '/nonexistent', pollIntervalMs: 60_000,
    });
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });
  afterAll(() => app.close());

  const send = (body: unknown, auth = `Bearer ${TOKEN}`) => fetch(`${base}/api/hooks/claude-code`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: auth }, body: typeof body === 'string' ? body : JSON.stringify(body),
  });

  it('needs the token, like Claude Code sends it from allowedEnvVars', async () => {
    expect((await send(SESSION[0], 'Bearer ')).status).toBe(401);
    expect((await send(SESSION[0], '')).status).toBe(401);
  });

  it('takes a big PostToolUse (tool output) up to 1 MB, and refuses more', async () => {
    const big = { ...other('s-big', 'PostToolUse', { tool_name: 'Read', tool_response: { content: 'x'.repeat(500_000) } }), cwd: '/home/dev/big-repo' };
    expect((await send(big)).status).toBe(204);
    expect((await send({ ...big, tool_response: 'x'.repeat(1_100_000) })).status).toBe(413);
  });

  it('seats a mapped project at its character and shows it working, then needing you', async () => {
    for (const p of SESSION.slice(0, 5)) expect((await send(p)).status).toBe(204);
    let snap = await (await fetch(`${base}/api/office`)).json() as OfficeSnapshot;
    expect(snap.people.find((p) => p.id === 'jim')).toMatchObject({
      name: 'Jim Halpert', persona: 'paper-site', bot: { profile: 'paper-site', role: 'Pair programmer', adapter: 'claude-code' },
    });
    expect(snap.presence.jim).toMatchObject({ status: 'working', activity: 'Running: Run the checkout tests' });
    await send(SESSION[5]);
    snap = await (await fetch(`${base}/api/office`)).json() as OfficeSnapshot;
    expect(snap.presence.jim).toMatchObject({ status: 'needs-input', activity: 'Needs permission for Bash (Run the checkout tests)' });
  });
});

describe('an oversized hook body', () => {
  it('is refused with Connection: close, so the next hook gets a fresh connection', async () => {
    const app = createApp({ adapters: [createClaudeCodeAdapter({ token: TOKEN })], hermesHome: '/nonexistent', headshotDir: '/nonexistent', pollIntervalMs: 60_000 });
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}/api/hooks/claude-code`;
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` };
    const big = await fetch(url, { method: 'POST', headers, body: JSON.stringify(other('s-x', 'PostToolUse', { tool_response: 'x'.repeat(1_100_000) })) });
    expect(big.status).toBe(413);
    expect(big.headers.get('connection')).toBe('close');
    for (let i = 0; i < 5; i += 1) {
      expect((await fetch(url, { method: 'POST', headers, body: JSON.stringify(other('s-x', 'UserPromptSubmit')) })).status).toBe(204);
    }
    await app.close();
  });
});
