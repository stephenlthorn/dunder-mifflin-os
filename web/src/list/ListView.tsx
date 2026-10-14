// The list view (phones, or the List toggle): everyone grouped by where they are now, with status and activity.
// Tapping a person opens their window (a full-screen sheet on phones); room chips open the room.
import { useMemo } from 'react';
import type { OfficeSnapshot } from '@shared/contract';
import { Portrait } from '../chrome/Portrait';
import { FILTERS, FILTER_META, type FleetFilter, filterCounts } from '../office/filters';
import { personLabel, STATUS_META, statusWord } from '../office/status';
import { type ListRow, listGroups } from './listModel';

type Props = {
  snapshot: OfficeSnapshot;
  filter: FleetFilter;
  live: boolean;
  onFilter: (f: FleetFilter) => void;
  onOpenPerson: (id: string) => void;
  onOpenArea: (areaId: string, roomId?: string) => void;
};

/** The sepia/grey filters the drawn portraits refer to (the map, which normally defines them, isn't mounted). */
function PortraitDefs() {
  return (
    <svg width="0" height="0" className="sr-only" aria-hidden="true" focusable="false">
      <filter id="dm-sepia" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values="0.64 0.46 0.11 0 0.02  0.21 0.81 0.1 0 0.02  0.16 0.32 0.48 0 0.01  0 0 0 1 0" />
      </filter>
    </svg>
  );
}

function Row({ row, live, onOpen }: { row: ListRow; live: boolean; onOpen: (id: string) => void }) {
  const { person, presence } = row;
  const meta = STATUS_META[presence.status];
  const activity = presence.activity?.trim();
  const label = [personLabel(person, presence), row.where ?? '', activity ?? ''].filter(Boolean).join(' — ');
  return (
    <li>
      <button type="button" className={`list-row status-${presence.status}`} aria-label={label} onClick={() => onOpen(person.id)}>
        <Portrait person={person} live={live} size="list" decorative />
        <span className="list-main">
          <span className="list-name">{person.name}</span>
          <span className="list-sub">
            {person.bot ? person.bot.profile : person.title}
            {row.where && <> · {row.where}</>}
          </span>
          {activity && <span className="list-activity">{activity}</span>}
        </span>
        <span className="list-status">
          <span className="dot" style={{ background: meta.color }} aria-hidden="true" />
          {person.bot ? statusWord(presence.status) : 'no bot'}
        </span>
      </button>
    </li>
  );
}

export function ListView({ snapshot, filter, live, onFilter, onOpenPerson, onOpenArea }: Props) {
  const groups = useMemo(() => listGroups(snapshot, filter), [snapshot, filter]);
  const counts = useMemo(() => filterCounts(snapshot), [snapshot]);
  return (
    <div className="list-view">
      <PortraitDefs />
      <div className="list-filters" role="toolbar" aria-label="Fleet filter">
        <button type="button" aria-pressed={filter === 'all'} onClick={() => onFilter('all')}>Everyone <span>{snapshot.people.length}</span></button>
        {FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => onFilter(filter === f ? 'all' : f)}>
            {FILTER_META[f].label} <span>{counts[f]}</span>
          </button>
        ))}
      </div>
      {groups.map((g) => (
        <section key={g.areaId} className="list-group" aria-labelledby={`list-${g.areaId}`}>
          <header className="list-head">
            <h2 id={`list-${g.areaId}`}>{g.name}</h2>
            {g.rooms.map((r) => (
              <button key={r.id} type="button" className="room-chip" onClick={() => onOpenArea(g.areaId, r.id)}>{r.name} room</button>
            ))}
          </header>
          {g.rows.length > 0
            ? <ul className="list-rows">{g.rows.map((row) => <Row key={row.person.id} row={row} live={live} onOpen={onOpenPerson} />)}</ul>
            : <p className="list-nobody">Nobody here right now.</p>}
        </section>
      ))}
      {groups.length === 0 && (
        <p className="list-empty">Nobody matches “{FILTER_META[filter].label}” right now. <button type="button" className="link-btn" onClick={() => onFilter('all')}>Show everyone</button></p>
      )}
    </div>
  );
}
