// How timeline events are shown: a label, a group (the filter chips), a tone and a glyph per kind, the filters, and
// relative times ("5 min ago", "yesterday 14:02"). Pure.
import type { TimelineEvent, TimelineKind } from '@shared/observability';

export type TimelineGroup = 'messages' | 'tools' | 'tasks' | 'cron' | 'sessions' | 'errors';
export type TimelineFilter = 'all' | TimelineGroup;
export type Tone = 'ok' | 'info' | 'warn' | 'bad' | 'muted';

export const TIMELINE_FILTERS: ReadonlyArray<{ id: TimelineFilter; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'messages', label: 'Messages' }, { id: 'tools', label: 'Tools' }, { id: 'tasks', label: 'Tasks' },
  { id: 'cron', label: 'Jobs' }, { id: 'sessions', label: 'Sessions' }, { id: 'errors', label: 'Errors' },
];

export const KIND_META: Readonly<Record<TimelineKind, { label: string; group: TimelineGroup; tone: Tone; glyph: string }>> = {
  'session.started': { label: 'Session started', group: 'sessions', tone: 'muted', glyph: '▶' },
  'session.ended': { label: 'Session ended', group: 'sessions', tone: 'muted', glyph: '■' },
  'message.in': { label: 'Message in', group: 'messages', tone: 'info', glyph: '↘' },
  'message.out': { label: 'Message out', group: 'messages', tone: 'info', glyph: '↗' },
  'tool.call': { label: 'Tools', group: 'tools', tone: 'muted', glyph: '⚙' },
  activity: { label: 'Activity', group: 'tools', tone: 'muted', glyph: '•' },
  'task.created': { label: 'New task', group: 'tasks', tone: 'info', glyph: '+' },
  'task.started': { label: 'Task started', group: 'tasks', tone: 'info', glyph: '▷' },
  'task.finished': { label: 'Task done', group: 'tasks', tone: 'ok', glyph: '✓' },
  'task.blocked': { label: 'Task blocked', group: 'tasks', tone: 'warn', glyph: '‖' },
  'cron.ok': { label: 'Scheduled job', group: 'cron', tone: 'ok', glyph: '◷' },
  'cron.fail': { label: 'Job failed', group: 'cron', tone: 'bad', glyph: '◷' },
  status: { label: 'Status', group: 'sessions', tone: 'muted', glyph: '◦' },
  error: { label: 'Error', group: 'errors', tone: 'bad', glyph: '!' },
};

export function filterEvents(events: readonly TimelineEvent[], filter: TimelineFilter): TimelineEvent[] {
  if (filter === 'all') return [...events];
  if (filter === 'errors') return events.filter((e) => e.kind === 'error' || e.kind === 'cron.fail');
  return events.filter((e) => KIND_META[e.kind].group === filter);
}

export const startOfToday = (now: number): number => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** 24-hour local clock time, the way the talking head and the list print it. */
export const clockTime = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function relativeTime(iso: string, now: number, clock: (ms: number) => string = clockTime): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const mins = Math.max(0, Math.round((now - t) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const today = startOfToday(now);
  if (t >= today) return `${Math.floor(mins / 60)} h ago`;
  if (t >= today - 86_400_000) return `yesterday ${clock(t)}`;
  return `${WEEKDAYS[new Date(t).getDay()]} ${clock(t)}`;
}
