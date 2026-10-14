import { afterAll, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { genericTool, publicModel, redactActivity, redactUsage } from '../scripts/redactActivity.ts';
import { createLiveActivity } from '../src/hermes/liveActivity.ts';
import { LEAK_PATTERNS } from './helpers/leakScan.ts';
import { A0, makeFakeActivityHome } from './helpers/fakeActivityHome.ts';

const home = makeFakeActivityHome();
afterAll(() => rmSync(home, { recursive: true, force: true }));

describe('redactActivity (fixture recording)', () => {
  it('keeps times, counts and outcomes, and replaces every id and piece of text', async () => {
    const live = createLiveActivity({ hermesHome: home });
    const raw = (await live.readActivity('campaigns', A0 - 86_400, 100))!;
    const red = redactActivity('campaigns', raw);
    const json = JSON.stringify(red);
    const textOnly = LEAK_PATTERNS.filter(([kind]) => !kind.startsWith('long digit run')); // raw records keep epoch seconds (10 digits)
    expect(textOnly.filter(([, re]) => re.test(json)).map(([k]) => k)).toEqual([]);
    expect(json).not.toContain('1001234567890');
    expect(json).not.toMatch(/Jan\]|Fourteen|Scranton|Leads chat|"s_tg"|"t_crash"|"j_digest"|"e3"|quota|MCP call failed sk/);
    expect(red.messages.map((m) => [m.role, m.at])).toEqual(raw.messages.map((m) => [m.role, m.at]));
    expect(red.runs.map((r) => r.outcome)).toEqual(raw.runs.map((r) => r.outcome));
    expect(red.cron.map((c) => [c.ok, c.delivery, c.at])).toEqual(raw.cron.map((c) => [c.ok, c.delivery, c.at]));
    expect(red.tools[0]?.count).toBe(3);
    expect(new Set(red.runs.filter((r) => r.outcome === 'completed').map((r) => r.title)).size).toBe(1);
  });

  it('keeps built-in tool names and makes MCP and custom tools generic', () => {
    expect(genericTool('terminal')).toBe('terminal');
    expect(genericTool('mcp__sabre__list_leads')).toMatch(/^mcp__(crm|mail|calendar|docs)__(list_items|get_item|search|update_item)$/);
    expect(genericTool('acme_internal_tool')).toBe('tool');
  });

  it('keeps public model names and hides custom ones', () => {
    expect(publicModel('MiniMax-M3.1-Flash-Preview')).toBe('MiniMax-M3.1-Flash-Preview');
    expect(publicModel('claude-fable-5.1 anthropic')).toBe('claude-fable-5.1');
    expect(publicModel('my-private-finetune')).toBe('custom-model');
  });

  it('keeps usage numbers and model names only', () => {
    expect(redactUsage([{ at: 1, model: 'claude-fable-5.1 anthropic', inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4, reasoningTokens: 0 }]))
      .toEqual([{ at: 1, model: 'claude-fable-5.1', inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4, reasoningTokens: 0 }]);
  });
});
