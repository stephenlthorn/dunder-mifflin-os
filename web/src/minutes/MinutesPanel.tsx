// The Conference Room's Minutes tab: Council sessions and shared tasks of the last week or month, newest first; pick
// one for its memo. Live data from GET /api/meetings; demo mode uses the shared demo minutes.
import { useMemo, useState } from 'react';
import type { Meeting, OfficeSnapshot } from '@shared/contract';
import { demoMeetingsIn, fetchMeetings } from '../data/calendarApi';
import { useLoaded } from '../data/useLoaded';
import { MEETING_META, type MeetingFilter, durationText, filterMeetings } from './memo';
import { MinutesMemo } from './MinutesMemo';

type Props = { snapshot: OfficeSnapshot; demo: boolean; now: number };

const DAY_MS = 86_400_000;
const PERIODS = [{ days: 7, label: 'Last 7 days' }, { days: 30, label: 'Last 30 days' }] as const;
const FILTERS: readonly { id: MeetingFilter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'council', label: 'Council' }, { id: 'shared-task', label: 'Shared tasks' }];
const REFRESH_MS = 120_000;
const startText = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function MeetingRow({ m, names, onOpen }: { m: Meeting; names: (ids: readonly string[]) => string; onOpen: () => void }) {
  return (
    <li>
      <button type="button" className="mtg-row" onClick={onOpen} aria-label={`${m.title}, ${MEETING_META[m.status].word}, ${startText(m.startedAt)}`}>
        <span className={`mtg-pill ${MEETING_META[m.status].className}`}>{MEETING_META[m.status].word}</span>
        <span className="mtg-title">{m.title}</span>
        <span className="mtg-meta muted">
          {m.kind === 'council' ? 'Council' : 'Shared task'} · {startText(m.startedAt)}{m.endedAt ? ` · ${durationText(m.startedAt, m.endedAt)}` : ''}
          {m.agenda.length > 1 ? ` · ${m.agenda.length} items` : ''}
        </span>
        <span className="mtg-people">{names(m.participantIds)}</span>
      </button>
    </li>
  );
}

export function MinutesPanel({ snapshot, demo, now }: Props) {
  const [days, setDays] = useState<number>(7);
  const [filter, setFilter] = useState<MeetingFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const span = { from: now - days * DAY_MS, to: now + DAY_MS };
  const data = useLoaded(`${demo}:${days}`, (signal) => (demo ? Promise.resolve(demoMeetingsIn(span, now)) : fetchMeetings(span, signal)),
    demo ? undefined : REFRESH_MS);
  const people = useMemo(() => new Map(snapshot.people.map((p) => [p.id, p])), [snapshot.people]);
  const meetings = filterMeetings(data.value?.meetings ?? [], filter);
  const open = openId ? data.value?.meetings.find((m) => m.id === openId) : undefined;
  const names = (ids: readonly string[]) => ids.map((id) => people.get(id)?.name.split(' ')[0] ?? id).join(', ');
  const roomName = (id: string) => snapshot.rooms.find((r) => r.id === id)?.name ?? id;

  if (open) return <MinutesMemo meeting={open} people={people} roomName={roomName(open.roomId)} onBack={() => setOpenId(null)} />;
  return (
    <div className="minutes" data-testid="minutes">
      <p className="muted">Minutes of every Council session and shared task, taken from the record. Nobody had to stay late to type them.</p>
      <div className="minutes-filters">
        <div role="group" aria-label="Period">
          {PERIODS.map((p) => <button key={p.days} type="button" className="cal-btn" aria-pressed={days === p.days} onClick={() => setDays(p.days)}>{p.label}</button>)}
        </div>
        <div role="group" aria-label="Kind of meeting">
          {FILTERS.map((f) => <button key={f.id} type="button" className="cal-btn" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
        </div>
      </div>
      {data.error && <p className="cal-error" role="alert">Couldn’t load the minutes: {data.error} <button type="button" className="link-btn" onClick={data.reload}>Try again</button></p>}
      {!data.value && !data.error && <p className="muted" role="status">Finding the minutes…</p>}
      {data.value && meetings.length === 0 && <p className="muted">No meetings in this period.</p>}
      <ul className="mtg-list" aria-label="Meetings">
        {meetings.map((m) => <MeetingRow key={m.id} m={m} names={names} onOpen={() => setOpenId(m.id)} />)}
      </ul>
    </div>
  );
}
