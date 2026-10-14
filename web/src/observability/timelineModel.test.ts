import { describe, expect, it } from 'vitest';
import type { TimelineEvent } from '@shared/observability';
import { KIND_META, TIMELINE_FILTERS, filterEvents, relativeTime, startOfToday } from './timelineModel';
import { TIMELINE_KINDS } from '@shared/observability';

const NOW = new Date(2026, 9, 13, 15, 0, 0).getTime();
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const ev = (kind: TimelineEvent['kind'], minutesAgo: number, title = kind): TimelineEvent => ({ id: `${kind}-${minutesAgo}`, at: at(minutesAgo), kind, title });
const hhmm = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

describe('timeline kinds', () => {
  it('has a label, a group and a tone for every kind', () => {
    for (const kind of TIMELINE_KINDS) {
      expect(KIND_META[kind].label.length, kind).toBeGreaterThan(0);
      expect(TIMELINE_FILTERS.map((f) => f.id)).toContain(KIND_META[kind].group);
    }
  });
});

describe('filterEvents', () => {
  const events = [ev('message.in', 1), ev('tool.call', 2), ev('cron.fail', 3), ev('cron.ok', 4), ev('error', 5), ev('task.finished', 6), ev('session.started', 7), ev('status', 8)];
  it('keeps everything for All and one group otherwise; errors include failed jobs', () => {
    expect(filterEvents(events, 'all')).toHaveLength(events.length);
    expect(filterEvents(events, 'messages').map((e) => e.kind)).toEqual(['message.in']);
    expect(filterEvents(events, 'cron').map((e) => e.kind)).toEqual(['cron.fail', 'cron.ok']);
    expect(filterEvents(events, 'errors').map((e) => e.kind)).toEqual(['cron.fail', 'error']);
    expect(filterEvents(events, 'tasks').map((e) => e.kind)).toEqual(['task.finished']);
    expect(filterEvents(events, 'sessions').map((e) => e.kind)).toEqual(['session.started', 'status']);
  });
});

describe('relativeTime', () => {
  it('says just now, minutes, hours, yesterday and the weekday', () => {
    expect(relativeTime(at(0.2), NOW, hhmm)).toBe('just now');
    expect(relativeTime(at(5), NOW, hhmm)).toBe('5 min ago');
    expect(relativeTime(at(150), NOW, hhmm)).toBe('2 h ago');
    expect(relativeTime(at(16 * 60), NOW, hhmm)).toBe(`yesterday ${hhmm(NOW - 16 * 3600_000)}`);
    expect(relativeTime(at(3 * 24 * 60), NOW, hhmm)).toMatch(/^[A-Z][a-z]{2} \d\d:\d\d$/);
    expect(relativeTime('nonsense', NOW, hhmm)).toBe('');
  });
});

describe('startOfToday', () => {
  it('is local midnight', () => {
    expect(startOfToday(NOW)).toBe(new Date(2026, 9, 13).getTime());
  });
});
