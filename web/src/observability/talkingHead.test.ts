import { describe, expect, it } from 'vitest';
import type { TimelineEvent } from '@shared/observability';
import { talkingHead } from './talkingHead';

const NOW = new Date(2026, 9, 13, 15, 0, 0).getTime();
const clock = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const todayAt = (h: number, m: number) => new Date(2026, 9, 13, h, m).toISOString();
let n = 0;
const ev = (kind: TimelineEvent['kind'], when: string, title: string, extra: Partial<TimelineEvent> = {}): TimelineEvent => ({ id: `e${(n += 1)}`, at: when, kind, title, ...extra });
const say = (events: TimelineEvent[], name = 'Dwight') => talkingHead(events, { name, now: NOW, clock });

describe('talkingHead', () => {
  it('sums up the day like a documentary confessional: jobs, failures with their time, tasks, messages, tools, errors', () => {
    const events = [
      ev('cron.ok', todayAt(8, 0), 'Campaign report'),
      ev('cron.fail', todayAt(9, 14), 'Campaign report', { detail: 'RuntimeError' }),
      ev('cron.ok', todayAt(10, 0), 'Campaign report'),
      ev('task.finished', todayAt(11, 0), 'Audit the Q4 report'),
      ev('task.finished', todayAt(11, 30), 'Order toner'),
      ev('task.blocked', todayAt(12, 0), 'Call Scranton'),
      ev('message.in', todayAt(12, 5), 'How many leads?'),
      ev('message.out', todayAt(12, 6), 'Fourteen.'),
      ev('tool.call', todayAt(12, 6), 'terminal, crm: list_leads', { count: 26 }),
      ev('error', todayAt(13, 5), 'asyncio: Unclosed client session', { count: 2 }),
    ];
    expect(say(events)).toBe(
      'Today Dwight ran Campaign report 3 times (1 failed at 09:14), finished 2 tasks (1 is blocked), got 1 message and sent 1, '
      + 'made 26 tool calls and hit 2 errors, the last at 13:05.',
    );
  });

  it('names the two busiest jobs and counts the rest', () => {
    const events = [
      ...Array.from({ length: 4 }, (_, i) => ev('cron.ok', todayAt(8, i), 'Lead digest')),
      ev('cron.ok', todayAt(9, 0), 'Inbox sweep'), ev('cron.ok', todayAt(9, 30), 'Inbox sweep'),
      ev('cron.ok', todayAt(10, 0), 'Morning report'),
      ev('cron.fail', todayAt(10, 30), 'Health check'), ev('cron.fail', todayAt(11, 45), 'Health check'),
    ];
    expect(say(events, 'Pam')).toBe('Today Pam ran Lead digest 4 times, Health check twice and 2 other jobs (2 failed, the last at 11:45).');
  });

  it('ignores yesterday and says so when nothing happened today', () => {
    const yesterday = new Date(2026, 9, 12, 22, 0).toISOString();
    expect(say([ev('cron.ok', yesterday, 'Lead digest')], 'Kelly')).toBe('Nothing on camera yet today. Kelly is keeping a low profile.');
    expect(say([], 'Kelly')).toBe('Nothing on camera yet today. Kelly is keeping a low profile.');
  });

  it('starts and finishes work in plain words', () => {
    expect(say([ev('task.started', todayAt(9, 0), 'Ship v2'), ev('session.started', todayAt(8, 0), 'Terminal session')], 'Jim'))
      .toBe('Today Jim started 1 task and opened 1 session.');
    expect(say([ev('message.out', todayAt(9, 0), 'Hi'), ev('message.out', todayAt(9, 1), 'Again')], 'Jim')).toBe('Today Jim sent 2 messages.');
    expect(say([ev('cron.ok', todayAt(9, 0), 'Lead digest')], 'Jim')).toBe('Today Jim ran Lead digest once.');
  });
});
