import { describe, expect, it } from 'vitest';
import type { TimelineEvent, TimelineKind } from '@shared/observability';
import { computeDundies, formatDuration, tally } from './awards';
import type { BotWeek } from './signals';

const TO = Date.parse('2026-10-16T17:00:00.000Z');
const WINDOW = { from: TO - 7 * 86_400_000, to: TO };
let seq = 0;
const ev = (minsAgo: number, kind: TimelineKind, title = 'thing', extra: Partial<TimelineEvent> = {}): TimelineEvent =>
  ({ id: `e${(seq += 1)}`, at: new Date(TO - minsAgo * 60_000).toISOString(), kind, title, ...extra });
const bot = (personId: string, name: string, events: TimelineEvent[], extra: Partial<BotWeek> = {}): BotWeek =>
  ({ personId, name, events, source: 'timeline', cost: undefined, ...extra });

const dwight = bot('dwight', 'Dwight Schrute', [
  ev(10, 'task.finished', 'Audit Q4'), ev(200, 'task.started', 'Audit Q4'),
  ev(20, 'task.finished', 'Leads'), ev(30, 'task.finished', 'Paper'),
  ev(40, 'tool.call', 'crm', { count: 40 }), ev(50, 'message.out', 'Done.'),
  ev(60, 'cron.fail', 'Weekly report', { detail: 'quota exceeded' }), ev(70, 'error', 'crm: rate limited', { count: 2 }),
], { cost: 0.9 });
const pam = bot('pam', 'Pam Beesly', [
  ev(5, 'task.finished', 'Digest'), ev(15, 'task.started', 'Digest'),
  ev(100, 'task.blocked', 'Send invoices'), ev(90, 'task.started', 'Send invoices'), ev(80, 'task.finished', 'Send invoices'),
  ev(300, 'task.blocked', 'Order cake'), ev(240, 'task.finished', 'Order cake'),
  ev(45, 'tool.call', 'mail', { count: 12 }), ev(46, 'message.out', 'Routed.'), ev(47, 'message.out', 'On it.'), ev(48, 'cron.ok', 'Digest'),
], { cost: 0.3 });
const oscar = bot('oscar', 'Oscar Martinez', [ev(10, 'cron.ok', 'Forecast'), ev(70, 'cron.ok', 'Forecast'), ev(500, 'task.started', 'Q4 report')], { cost: 0.05 });
const idle = bot('andy', 'Andy Bernard', []);

describe('tally', () => {
  it('counts cards, errors (with folded counts), activity and approval turnarounds', () => {
    const t = tally(dwight, WINDOW);
    expect(t).toMatchObject({ cards: 3, errors: 3, tools: 40, replies: 1, runs: 1, lastError: 'Weekly report: quota exceeded' });
    expect(tally(pam, WINDOW).turnarounds).toEqual([10 * 60_000, 60 * 60_000]);
  });

  it('times the longest card from its start to its finish, or to now while it is still open', () => {
    expect(tally(dwight, WINDOW).longest).toEqual({ title: 'Audit Q4', ms: 190 * 60_000, open: false });
    expect(tally(oscar, WINDOW).longest).toEqual({ title: 'Q4 report', ms: 500 * 60_000, open: true });
  });

  it('ignores events outside the week', () => {
    expect(tally(bot('x', 'X', [ev(8 * 24 * 60, 'task.finished')]), WINDOW).cards).toBe(0);
  });
});

describe('computeDundies', () => {
  const digest = computeDundies([dwight, pam, oscar, idle], WINDOW);
  const award = (id: string) => digest.awards.find((a) => a.id === id);

  it('gives each award to the bot the real numbers favour, with the numbers as the reason', () => {
    expect(award('hottest')).toMatchObject({ title: 'Hottest in the Office', neutral: 'Most cards done', winnerId: 'dwight', reason: '3 cards done' });
    expect(award('busiest')).toMatchObject({ title: 'Busiest Beaver', winnerId: 'dwight' });
    expect(award('busiest')?.reason).toContain('40 tool calls');
    expect(award('unbroken')).toMatchObject({ title: 'Best Dundie for Not Breaking Anything', neutral: 'Zero errors', winnerId: 'pam' });
    expect(award('unbroken')?.reason).toMatch(/^0 errors in \d+ /);
    expect(award('fine-work')).toMatchObject({ title: 'Fine Work', winnerId: 'pam', reason: 'approvals turned around in 35 min (median of 2)' });
    expect(award('longest')).toMatchObject({ winnerId: 'oscar', reason: '“Q4 report” has run 8 h 20 min and counting' });
    expect(award('tight')).toMatchObject({ winnerId: 'pam', reason: '$0.10 a card ($0.30 for 3 cards)' });
    expect(award('dont-go-in')).toMatchObject({ winnerId: 'dwight', trophy: false, reason: '3 errors; last: Weekly report: quota exceeded' });
  });

  it('puts trophies on the desks of every winner but the one with the most errors', () => {
    expect(digest.awards.filter((a) => a.trophy).map((a) => a.id)).toEqual(['hottest', 'busiest', 'unbroken', 'fine-work', 'longest', 'tight']);
  });

  it('skips an award nobody qualifies for', () => {
    const quiet = computeDundies([oscar, idle], WINDOW);
    expect(quiet.awards.map((a) => a.id)).not.toContain('hottest');
    expect(quiet.awards.map((a) => a.id)).not.toContain('fine-work');
    expect(quiet.awards.map((a) => a.id)).not.toContain('dont-go-in');
    expect(computeDundies([], WINDOW).awards).toEqual([]);
  });

  it('is deterministic: same input, same result, whatever the order; ties go to the earlier name', () => {
    const again = computeDundies([idle, oscar, pam, dwight], WINDOW);
    expect(again).toEqual(digest);
    const twinA = bot('b', 'Bob', [ev(5, 'task.finished')]);
    const twinB = bot('a', 'Al', [ev(6, 'task.finished')]);
    expect(computeDundies([twinA, twinB], WINDOW).awards.find((a) => a.id === 'hottest')?.winnerId).toBe('a');
  });

  it('counts an error happening right now even before the timeline has it', () => {
    const now = bot('kevin', 'Kevin Malone', [ev(30, 'cron.ok')], { errorNow: 'Spilled chili on the import' });
    expect(computeDundies([now, oscar], WINDOW).awards.find((a) => a.id === 'dont-go-in')).toMatchObject({ winnerId: 'kevin', reason: '1 error; last: Spilled chili on the import' });
  });
});

describe('formatDuration', () => {
  it('reads like a person would say it', () => {
    expect(formatDuration(20_000)).toBe('under a minute');
    expect(formatDuration(35 * 60_000)).toBe('35 min');
    expect(formatDuration(120 * 60_000)).toBe('2 h');
    expect(formatDuration(500 * 60_000)).toBe('8 h 20 min');
    expect(formatDuration(50 * 3600_000)).toBe('2 d 2 h');
  });
});
