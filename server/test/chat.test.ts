import { describe, expect, it } from 'vitest';
import { buildChatArgs, buildKanbanCreateArgs, chatSessionTitle, chatTarget } from '../src/chat/commands.ts';
import { createChatService } from '../src/chat/chatService.ts';
import { createTaskService } from '../src/chat/taskService.ts';
import type { ExecResult, Runner } from '../src/chat/runner.ts';

const ok = (stdout: string): ExecResult => ({ stdout, stderr: 'session_id: 2026_x', code: 0, timedOut: false });
const NOW = () => 1_800_000_000_000;

function recordingRunner(result: ExecResult | (() => Promise<ExecResult>)) {
  const calls: Array<{ file: string; args: ReadonlyArray<string>; timeoutMs: number }> = [];
  const runner: Runner = async (file, args, opts) => {
    calls.push({ file, args, timeoutMs: opts.timeoutMs });
    return typeof result === 'function' ? result() : result;
  };
  return { runner, calls };
}

describe('chat command builder', () => {
  it('targets the room lead with a room prefix, and the bot itself for a direct line', () => {
    expect(chatTarget('ops')).toEqual({ profile: 'tech', prefix: '[Ops room] ' });
    expect(chatTarget('council')).toEqual({ profile: 'chief', prefix: '[Council room] ' });
    expect(chatTarget('rnd')).toEqual({ profile: 'tech', prefix: '[R&D room] ' });
    expect(chatTarget('dm-campaigns')).toEqual({ profile: 'campaigns', prefix: '' });
    expect(chatTarget('dm-stamford')).toBeNull();
    expect(chatTarget('constructor')).toBeNull();
  });

  it('keeps one named Hermes session per room for continuity', () => {
    expect(chatSessionTitle('ops')).toBe('dmos-ops');
    expect(chatSessionTitle('dm-tech')).toBe('dmos-dm-tech');
  });

  it('builds argv with no shell, the text as a single --query= argument', () => {
    expect(buildChatArgs('tech', 'dmos-ops', '[Ops room] -rf; $(whoami) "hi"')).toEqual([
      '-p', 'tech', 'chat', '-Q', '-c', 'dmos-ops', '--create-if-missing', '--run-budget', '170',
      '--query=[Ops room] -rf; $(whoami) "hi"',
    ]);
  });

  it('builds the kanban create argv with the OS room marker', () => {
    expect(buildKanbanCreateArgs('Order more paper', 'campaigns', 'ops')).toEqual([
      'kanban', 'create', '--assignee', 'campaigns', '--created-by', 'dmos-ops', '--json', 'Order more paper',
    ]);
  });
});

describe('chat service', () => {
  it('runs hermes for the room lead and returns the reply as a ChatMessage', async () => {
    const { runner, calls } = recordingRunner(ok('\u001b[1mHello\u001b[0m from Ops.\n'));
    const chat = createChatService({ runner, hermesBin: '/bin/hermes', timeoutMs: 180_000, now: NOW });
    const result = await chat.send('ops', '  status?  ');
    expect(calls).toEqual([{ file: '/bin/hermes', args: buildChatArgs('tech', 'dmos-ops', '[Ops room] status?'), timeoutMs: 180_000 }]);
    expect(result).toEqual({ ok: true, messages: [{ id: expect.stringMatching(/^os-tech-/), roomId: 'ops', authorAgentId: 'tech', text: 'Hello from Ops.', at: new Date(NOW()).toISOString() }] });
  });

  it('allows one message in flight per profile (429 for the second)', async () => {
    let release: (r: ExecResult) => void = () => {};
    const pending = new Promise<ExecResult>((resolve) => { release = resolve; });
    const calls: string[] = [];
    const runner: Runner = async (_file, args) => {
      calls.push(args[1] ?? '');
      return args[1] === 'tech' ? pending : ok('hi');
    };
    const chat = createChatService({ runner, hermesBin: 'h', timeoutMs: 1000, now: NOW });
    const first = chat.send('ops', 'one');
    expect(chat.busy('tech')).toBe(true);
    expect(await chat.send('rnd', 'two')).toMatchObject({ ok: false, status: 429 }); // rnd is also led by tech
    expect(await chat.send('dm-campaigns', 'three')).toMatchObject({ ok: true }); // different profile, not blocked
    release(ok('done'));
    await first;
    expect(chat.busy('tech')).toBe(false);
    expect(calls).toEqual(['tech', 'campaigns']);
  });

  it('frees the profile even when the runner throws', async () => {
    const chat = createChatService({ runner: async () => { throw new Error('spawn ENOENT'); }, hermesBin: 'h', timeoutMs: 1000, now: NOW });
    expect(await chat.send('ops', 'x')).toMatchObject({ ok: false, status: 502 });
    expect(chat.busy('tech')).toBe(false);
  });

  it('reports a timeout as 504 and a failed run as 502 without leaking stderr', async () => {
    const timeout = createChatService({ runner: async () => ({ stdout: '', stderr: '', code: null, timedOut: true }), hermesBin: 'h', timeoutMs: 1, now: NOW });
    expect(await timeout.send('ops', 'x')).toMatchObject({ ok: false, status: 504 });
    const failed = createChatService({ runner: async () => ({ stdout: '', stderr: 'token=abc /Users/me/.hermes', code: 1, timedOut: false }), hermesBin: 'h', timeoutMs: 1, now: NOW });
    const res = await failed.send('ops', 'x');
    expect(res).toMatchObject({ ok: false, status: 502 });
    expect(JSON.stringify(res)).not.toMatch(/token|Users/);
  });

  it('validates room and text before running anything', async () => {
    const { runner, calls } = recordingRunner(ok('x'));
    const chat = createChatService({ runner, hermesBin: 'h', timeoutMs: 1, now: NOW });
    expect(await chat.send('nope', 'hi')).toMatchObject({ ok: false, status: 404 });
    expect(await chat.send('ops', '   ')).toMatchObject({ ok: false, status: 400 });
    expect(await chat.send('ops', 'x'.repeat(2001))).toMatchObject({ ok: false, status: 400 });
    expect(await chat.send('ops', 'nul\u0000byte')).toMatchObject({ ok: false, status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('returns no message when the bot stays silent', async () => {
    const chat = createChatService({ runner: async () => ok('NO_REPLY\n'), hermesBin: 'h', timeoutMs: 1, now: NOW });
    expect(await chat.send('ops', 'x')).toEqual({ ok: true, messages: [] });
  });
});

describe('task service (kanban create)', () => {
  const created = ok(JSON.stringify({ id: 't_abc123', title: 'Order more paper', status: 'ready', assignee: 'campaigns', created_at: 1_800_000_000 }, null, 2));

  it('creates a shared Ops card for a bot profile and returns an adapter task (person ids are resolved by the office, see http.test)', async () => {
    const { runner, calls } = recordingRunner(created);
    const tasks = createTaskService({ runner, hermesBin: 'h', timeoutMs: 30_000 });
    const res = await tasks.create({ roomId: 'ops', title: '  Order more paper ', assignee: 'campaigns' });
    expect(calls[0]?.args).toEqual(buildKanbanCreateArgs('Order more paper', 'campaigns', 'ops'));
    expect(res).toEqual({ ok: true, task: { id: 't_abc123', title: 'Order more paper', status: 'todo', ownerAgentId: 'campaigns', roomId: 'ops', shared: true, updatedAt: new Date(1_800_000_000_000).toISOString() } });
    expect((await tasks.create({ roomId: 'ops', title: 'x', assignee: 'dwight' })).ok).toBe(false); // a person id, not a profile
  });

  it('rejects other rooms, unknown assignees and bad titles without running hermes', async () => {
    const { runner, calls } = recordingRunner(created);
    const tasks = createTaskService({ runner, hermesBin: 'h', timeoutMs: 1 });
    expect(await tasks.create({ roomId: 'hq', title: 'x', assignee: 'campaigns' })).toMatchObject({ ok: false, status: 400 });
    expect(await tasks.create({ roomId: 'ops', title: 'x', assignee: 'stamford' })).toMatchObject({ ok: false, status: 400 });
    expect(await tasks.create({ roomId: 'ops', title: '--assignee=tech', assignee: 'campaigns' })).toMatchObject({ ok: false, status: 400 });
    expect(await tasks.create({ roomId: 'ops', title: 'a\nb', assignee: 'campaigns' })).toMatchObject({ ok: false, status: 400 });
    expect(await tasks.create({ roomId: 'ops', title: 'y'.repeat(201), assignee: 'campaigns' })).toMatchObject({ ok: false, status: 400 });
    expect(calls).toHaveLength(0);
  });

  it('fails cleanly on unparseable output', async () => {
    const tasks = createTaskService({ runner: async () => ok('Created t_1 (ready)'), hermesBin: 'h', timeoutMs: 1 });
    expect(await tasks.create({ roomId: 'ops', title: 'x', assignee: 'campaigns' })).toMatchObject({ ok: false, status: 502 });
  });
});
