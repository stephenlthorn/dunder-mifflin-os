// OS top bar: logo, data source, "N need you" (opens HR · Approvals), fleet summary, Ask Pam, the calendar, the map/list
// toggle, settings, legend and the clock. On the demo day, `demo` (the DemoBar: badge, office clock, speed) takes the
// place of the data source and the clock.
import { type ReactNode, type RefObject, useEffect, useState } from 'react';
import { type FleetCounts, STATUS_META } from '../office/status';
import type { CorporateBadge } from '../budgets/budgetModel';
import { CalendarIcon, GearIcon, InfoIcon, ListIcon, MapIcon, SearchIcon } from './icons';

type Props = {
  counts: FleetCounts | null;
  source: { kind: 'loading' | 'live' | 'demo'; detail: string };
  paletteKey: string;
  onAskPam: () => void;
  view: 'map' | 'list';
  onToggleView: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  gearRef: RefObject<HTMLButtonElement | null>;
  settings?: ReactNode;
  readOnly?: boolean;
  onOpenCalendar?: () => void; // the Party Planning Committee calendar
  needYou?: number | null; // null/absent: not loaded yet
  onOpenInbox?: () => void;
  corporate?: CorporateBadge | null; // bots near / over budget; null/absent: nothing to say
  onOpenCorporate?: () => void; // opens Angela's ledger, budgets first
  demo?: ReactNode;
};

const FLEET: (keyof typeof STATUS_META & keyof FleetCounts)[] = ['working', 'meeting', 'idle', 'error', 'offline'];

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  const day = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return <time className="clock" dateTime={now.toISOString()}>{day} · {time}</time>;
}

function Legend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="legend">
      <button type="button" className="chrome-btn" aria-label="Legend" aria-expanded={open} aria-controls="legend-panel" onClick={() => setOpen((o) => !o)}>
        <InfoIcon /><span className="btn-label">Legend</span>
      </button>
      {open && (
        <div id="legend-panel" className="legend-panel" role="region" aria-label="Status legend">
          <ul>
            {Object.entries(STATUS_META).map(([k, m]) => (
              <li key={k}><span className={`dot ring-legend legend-${k}`} style={{ borderColor: m.color, background: `${m.color}33` }} />{m.legend}</li>
            ))}
          </ul>
          <p>Ring under each mini = status. Chip above = what they are doing. Bots in a meeting sit in the Conference Room. Sepia = no bot yet.</p>
          <p>Drag to pan, scroll or +/− to zoom, Fit to frame. Esc closes the top window.</p>
        </div>
      )}
    </div>
  );
}

function NeedYou({ count, onOpen }: { count: number; onOpen: () => void }) {
  const label = `${count} need${count === 1 ? 's' : ''} you`;
  return (
    <button type="button" className={`chrome-btn need-you-btn${count ? ' has-some' : ''}`} data-testid="need-you" aria-label={`${label}: open HR · Approvals`} onClick={onOpen}>
      <span className="need-you-mark" aria-hidden="true">?</span><strong>{count}</strong><span className="btn-label">need{count === 1 ? 's' : ''} you</span>
    </button>
  );
}

function Corporate({ badge, onOpen }: { badge: CorporateBadge; onOpen: () => void }) {
  const count = badge.over || badge.warn;
  return (
    <button type="button" className={`chrome-btn corporate-btn ${badge.over ? 'is-over' : 'is-warn'}`} data-testid="corporate"
      aria-label={`Corporate: ${badge.label}. Open Angela’s ledger`} title={`Corporate: ${badge.label}`} onClick={onOpen}>
      <span className="corporate-mark" aria-hidden="true">$</span><strong>{count}</strong><span className="btn-label">{badge.over ? 'over budget' : 'near budget'}</span>
    </button>
  );
}

export function TopBar({
  counts, source, paletteKey, onAskPam, view, onToggleView, settingsOpen, onToggleSettings, gearRef, settings, readOnly = false, needYou = null, onOpenInbox,
  onOpenCalendar, corporate = null, onOpenCorporate, demo,
}: Props) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">DM</span>
        <span className="brand-name">Dunder Mifflin <strong>OS</strong></span>
      </div>
      {demo ?? (
        <span className={`source source-${source.kind}`} title={source.detail} data-testid="source">
          {source.kind === 'live' ? 'Live' : source.kind === 'demo' ? 'Demo' : 'Connecting…'}
        </span>
      )}
      {readOnly && (
        <span className="source source-readonly" data-testid="read-only" title="Chat and new tasks are off. Restart the server with DMOS_ALLOW_WRITES=1 to turn them on.">
          Read-only
        </span>
      )}
      {needYou !== null && onOpenInbox && <NeedYou count={needYou} onOpen={onOpenInbox} />}
      {corporate && onOpenCorporate && <Corporate badge={corporate} onOpen={onOpenCorporate} />}
      {counts && (
        <ul className="fleet" aria-label="Fleet summary">
          {FLEET.map((k) => (
            <li key={k} data-testid={`fleet-${k}`}>
              <span className="dot" style={{ background: STATUS_META[k].color }} aria-hidden="true" />
              <strong>{counts[k]}</strong> {STATUS_META[k].legend.toLowerCase()}
            </li>
          ))}
          <li className="fleet-total">{counts.bots} bots · {counts.staff} staff</li>
        </ul>
      )}
      <div className="topbar-right">
        <button type="button" className="chrome-btn ask-pam-btn" aria-label="Ask Pam: search and commands" aria-keyshortcuts="Meta+K Control+K" onClick={onAskPam}>
          <SearchIcon /><span className="btn-label">Ask Pam</span><kbd>{paletteKey}</kbd>
        </button>
        {onOpenCalendar && (
          <button type="button" className="chrome-btn icon-only" aria-label="Party Planning Committee calendar" title="Party Planning Committee calendar" onClick={onOpenCalendar}>
            <CalendarIcon />
          </button>
        )}
        <button type="button" className="chrome-btn" aria-label={view === 'map' ? 'Show the list' : 'Show the map'} onClick={onToggleView}>
          {view === 'map' ? <ListIcon /> : <MapIcon />}<span className="btn-label">{view === 'map' ? 'List' : 'Map'}</span>
        </button>
        <div className="settings">
          <button
            ref={gearRef}
            type="button"
            className="chrome-btn icon-only"
            aria-label="Settings"
            aria-expanded={settingsOpen}
            aria-controls={settingsOpen ? 'settings-panel' : undefined}
            onClick={onToggleSettings}
          >
            <GearIcon />
          </button>
          {settings}
        </div>
        <Legend />
        {!demo && <Clock />}
      </div>
    </header>
  );
}
