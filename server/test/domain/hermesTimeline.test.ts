// Raw Hermes activity -> timeline events: short, scrubbed, titles only for tasks, newest first.
import { afterAll, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { hermesTimeline } from '../../src/domain/hermesTimeline.ts';
import { firstLine, oneLine } from '../../src/domain/oneLine.ts';
import { createLiveActivity } from '../../src/hermes/liveActivity.ts';
import { LEAK_PATTERNS } from '../helpers/leakScan.ts';
import { A0, makeFakeActivityHome } from '../helpers/fakeActivityHome.ts';

const home = makeFakeActivityHome();
afterAll(() => rmSync(home, { recursive: true, force: true }));
const iso = (epoch: number) => new Date(epoch * 1000).toISOString();

async function events(since = A0 - 86_400, limit = 100) {
  const activity = await createLiveActivity({ hermesHome: home }).readActivity('campaigns', since, limit);
  return hermesTimeline(activity!, { since, limit });
}

describe('oneLine / firstLine', () => {
  it('makes one scrubbed line of at most max characters', () => {
    expect(oneLine('Hello\n  there\tfriend', 80)).toBe('Hello there friend');
    expect(oneLine('x'.repeat(100), 10)).toBe(`${'x'.repeat(9)}…`);
    expect(oneLine('key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123 ok', 80)).toBe('key [secret] ok');
    expect(firstLine('\n\nRuntimeError: quota\nTraceback /Users/x', 80)).toBe('RuntimeError: quota');
  });
});

describe('hermesTimeline', () => {
  it('lets no secret, phone number, path or chat id out', async () => {
    const text = JSON.stringify(await events());
    expect(LEAK_PATTERNS.filter(([, re]) => re.test(text)).map(([k]) => k)).toEqual([]);
    expect(text).not.toMatch(/PRIVATE|tool output|Traceback/);
  });

  it('is newest first, within the window, with unique ids and one-line titles of at most 80 characters', async () => {
    const list = await events();
    const times = list.map((e) => Date.parse(e.at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(Math.min(...times)).toBeGreaterThanOrEqual((A0 - 86_400) * 1000);
    expect(new Set(list.map((e) => e.id)).size).toBe(list.length);
    for (const e of list) {
      expect(e.title.length).toBeLessThanOrEqual(80);
      expect(e.title).not.toMatch(/\n/);
    }
  });

  it('summarises messages in and out in one line', async () => {
    const list = await events();
    const msgs = list.filter((e) => e.kind.startsWith('message.'));
    expect(msgs.map((e) => [e.kind, e.source])).toEqual([['message.out', 'telegram'], ['message.in', 'telegram'], ['message.out', 'cron']]);
    expect(msgs[1]?.title).toMatch(/^\[Jan\] How many leads today\? Also \[secret\]/);
    expect(msgs[2]?.title).toBe('Digest sent: 3 hot leads.');
  });

  it('folds a session\'s tool calls into one event naming the most used tools', async () => {
    const tools = (await events()).filter((e) => e.kind === 'tool.call');
    expect(tools[0]).toMatchObject({ at: iso(A0 - 1170), title: 'crm: list_leads, terminal', detail: '3 tool calls', count: 3, source: 'telegram' });
    expect(tools[1]).toMatchObject({ title: 'web_search', detail: '1 tool call', count: 1, source: 'cron' });
  });

  it('turns cards and runs into task events by title, and crashed runs into errors', async () => {
    const list = await events();
    const of = (kind: string) => list.filter((e) => e.kind === kind).map((e) => [e.title, e.at, e.detail]);
    expect(of('task.created').map(([t]) => t)).toEqual([expect.stringMatching(/^Call the Scranton prospects \[secret\]/), 'Weekly campaign report', 'Refresh the client list']);
    expect(of('task.started').map(([t]) => t)).toEqual([expect.stringMatching(/^Call the Scranton/), 'Refresh the client list', 'Weekly campaign report']);
    expect(of('task.finished')).toEqual([['Weekly campaign report', iso(A0 - 4000), undefined]]);
    expect(list.find((e) => e.kind === 'error' && e.source === 'kanban')).toMatchObject({ title: 'Refresh the client list', detail: 'Run crashed', at: iso(A0 - 3400) });
  });

  it('names cron runs after their job and says how they went', async () => {
    const cron = (await events()).filter((e) => e.kind.startsWith('cron.'));
    expect(cron.map((e) => [e.kind, e.title, e.detail])).toEqual([
      ['cron.ok', 'Scheduled job', 'delivered'],
      ['cron.fail', expect.stringMatching(/^Weekly report \[secret\]/), 'RuntimeError: quota'],
      ['cron.ok', 'Lead digest', 'nothing to send'],
      ['cron.ok', 'Lead digest', 'delivered'],
    ]);
  });

  it('folds repeated log errors into one event with a count', async () => {
    const errors = (await events()).filter((e) => e.kind === 'error' && e.source === 'log');
    expect(errors.map((e) => [e.title, e.count ?? 1, e.at])).toEqual([
      ['gateway.run: Gateway crashed', 1, iso(A0 - 900)],
      ['asyncio: Unclosed client session', 2, iso(A0 - 1000)],
      [expect.stringMatching(/^tools\.mcp: MCP call failed \[secret\]/), 1, iso(A0 - 1500)],
    ]);
  });

  it('shows conversation sessions starting and ending', async () => {
    const list = await events();
    expect(list.filter((e) => e.kind.startsWith('session.')).map((e) => [e.kind, e.title, e.detail])).toEqual([
      ['session.ended', 'Terminal session', '2 messages'],
      ['session.started', 'Terminal session', undefined],
      ['session.started', expect.stringMatching(/^Leads chat \[secret\]/), undefined],
    ]);
  });

  it('keeps only the newest `limit` events', async () => {
    const list = await events(A0 - 86_400, 5);
    expect(list).toHaveLength(5);
    expect(list[0]?.at).toBe(iso(A0 - 100));
  });
});
