// A person's Timeline tab: the talking head about today, then what happened (newest first) with filters, the last
// 24 hours or 7 days, relative times, and why there is nothing when there is nothing.
import { useMemo, useState } from 'react';
import type { OfficeSnapshot, Person } from '@shared/contract';
import type { TimelineEvent } from '@shared/observability';
import { shortName } from '../../office/names';
import { talkingHead } from '../../observability/talkingHead';
import { KIND_META, TIMELINE_FILTERS, type TimelineFilter, filterEvents, relativeTime } from '../../observability/timelineModel';
import { type TimelineRange, useTimeline } from '../../observability/useObservability';
import { TalkingHead } from './TalkingHead';

type Props = { person: Person; snapshot: OfficeSnapshot; demo: boolean };

const RANGES: ReadonlyArray<{ id: TimelineRange; label: string }> = [{ id: '24h', label: '24 h' }, { id: '7d', label: '7 days' }];

function EventRow({ e, now }: { e: TimelineEvent; now: number }) {
  const meta = KIND_META[e.kind];
  return (
    <li className={`tl-event tone-${meta.tone}`} data-kind={e.kind}>
      <span className="tl-glyph" aria-hidden="true">{meta.glyph}</span>
      <span className="tl-body">
        <span className="tl-title">
          <span className="tl-kind">{meta.label}</span> {e.title}
          {e.count && e.count > 1 && e.kind !== 'tool.call' ? <span className="tl-count"> ×{e.count}</span> : null}
        </span>
        {(e.detail || e.source) && <span className="tl-detail">{[e.detail, e.source].filter(Boolean).join(' · ')}</span>}
      </span>
      <time className="tl-time" dateTime={e.at} title={new Date(e.at).toLocaleString()}>{relativeTime(e.at, now)}</time>
    </li>
  );
}

export function TimelinePanel({ person, snapshot, demo }: Props) {
  const [range, setRange] = useState<TimelineRange>('24h');
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const timeline = useTimeline(person.id, range, { demo, snapshot });
  const now = demo ? Date.parse(snapshot.generatedAt) : Date.now();
  const data = timeline.phase === 'ready' ? timeline.data : null;
  const shown = useMemo(() => (data ? filterEvents(data.events, filter) : []), [data, filter]);
  const first = shortName(person.name);

  if (data && !data.available) {
    return <p className="muted tl-empty" role="note">{data.reason === 'No bot yet' ? `No bot yet — ${first} has nothing on camera.` : data.reason}</p>;
  }
  return (
    <div className="timeline-panel">
      {data && <TalkingHead person={person} text={talkingHead(data.events, { name: first, now })} now={now} live={!demo} />}
      <div className="tl-controls">
        <div className="tl-chips" role="group" aria-label="Show">
          {TIMELINE_FILTERS.map((f) => (
            <button key={f.id} type="button" className="chip-btn" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <div className="tl-range" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.id} type="button" className="chip-btn" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>
          ))}
          <button type="button" className="chip-btn" onClick={timeline.reload} aria-label="Refresh the timeline">↻</button>
        </div>
      </div>
      {timeline.phase === 'loading' && <p className="muted" role="status">Rolling the tape…</p>}
      {timeline.phase === 'error' && <p className="chat-error" role="alert">{timeline.error}</p>}
      {data && (shown.length ? (
        <ol className="tl-list" aria-label={`${first}'s timeline`}>
          {shown.map((e) => <EventRow key={e.id} e={e} now={now} />)}
        </ol>
      ) : <p className="muted tl-empty">{filter === 'all' ? `Nothing recorded in the last ${range === '24h' ? '24 hours' : '7 days'}.` : 'Nothing of this kind.'}</p>)}
      {data?.truncated && <p className="muted tl-note">Showing the newest {data.events.length} events.</p>}
    </div>
  );
}
