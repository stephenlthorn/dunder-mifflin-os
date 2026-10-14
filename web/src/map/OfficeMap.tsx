// The desktop: the isometric office with pan/zoom, depth-sorted scene and the chip/sign overlay. Keyboard: people and
// room signs in reading order (useMapKeys); "show on the map" glides the camera to a person or room (useMapFocus).
import { type FocusEvent, memo, useCallback, useEffect, useMemo, useRef } from 'react';
import type { OfficeSnapshot } from '@shared/contract';
import { OFFICE } from '@shared/office';
import { movedPeople } from '../office/placement';
import { buildScene } from '../office/scene';
import { DrawableView } from './DrawableView';
import { Floors } from './Floors';
import { chipsFor, contentBounds, occupantsBySeat, phoneSpot, placementsFor, signsFor } from './mapModel';
import { needYouCount } from '../office/needsYou';
import { ROW_PX, mapTargets } from './mapTargets';
import { readingRows } from './readingOrder';
import { type FocusRequest, useMapFocus } from './useMapFocus';
import { useMapKeys } from './useMapKeys';
import { centerOn, toWorld } from './viewport';
import { Overlay } from './Overlay';
import { CommitteePin } from './CommitteePin';
import { LedgerSign } from './LedgerSign';
import { PAL } from './palette';
import { PersonTip, usePersonTip } from './PersonTip';
import { usePanZoom } from './usePanZoom';
import { useDelight } from '../delight/DelightContext';
import { DELIGHT_OFFICE } from '../delight/ambient/spots';
import { withTrips } from '../delight/ambient/trips';
import { decorateChips, decorateOccupants } from '../delight/mapDecor';
import { CreedLayer, MapEggs, TrophyLayer } from '../delight/MapDelight';
import { useParkour } from '../delight/eggs/useParkour';

type Props = {
  snapshot: OfficeSnapshot;
  live: boolean;
  hidden?: ReadonlySet<string>; // people a fleet filter dims
  focusRequest?: FocusRequest | null;
  reduceMotion?: boolean;
  onOpenPerson: (id: string) => void;
  onOpenArea: (areaId: string) => void;
  onOpenLedger?: () => void; // the accounting corner's sign opens Angela's ledger
  onOpenCalendar?: () => void; // the Party Planning Committee pin in the break room
};

const NOBODY: ReadonlySet<string> = new Set();
const EDGE_PX = 32; // a focused target closer than this to the edge brings the camera along

const BOUNDS = contentBounds();
const PHONE = phoneSpot();

function Defs() {
  return (
    <defs>
      <filter id="dm-sepia" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values="0.64 0.46 0.11 0 0.02  0.21 0.81 0.1 0 0.02  0.16 0.32 0.48 0 0.01  0 0 0 1 0" />
      </filter>
      <filter id="dm-grey"><feColorMatrix type="saturate" values="0.05" /></filter>
      <filter id="dm-soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.4" /></filter>
      <radialGradient id="dm-bg" cx="50%" cy="45%" r="75%">
        <stop className="bg-in" offset="0%" stopColor="#f6f4ef" />
        <stop className="bg-out" offset="100%" stopColor={PAL.background} />
      </radialGradient>
      <marker id="dm-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10Z" fill="#8a7f70" />
      </marker>
    </defs>
  );
}

type SceneProps = { snapshot: OfficeSnapshot; hidden: ReadonlySet<string>; onOpenPerson: (id: string) => void };

const SceneLayer = memo(function SceneLayer({ snapshot, hidden, onOpenPerson }: SceneProps) {
  const { trips, unattributed, mode } = useDelight();
  const placements = useMemo(() => withTrips(placementsFor(snapshot), trips), [snapshot, trips]); // idle bots on a coffee run
  const key = placements.map((p) => `${p.personId}@${p.seatId}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scene = useMemo(() => buildScene(DELIGHT_OFFICE, placements), [key]);
  const previous = useRef<Map<string, string> | null>(null);
  const walking = useMemo(() => movedPeople(previous.current, placements), [placements]);
  useEffect(() => {
    previous.current = new Map(placements.map((p) => [p.personId, p.seatId]));
  }, [placements]);
  const occupants = useMemo(() => decorateOccupants(occupantsBySeat(snapshot, placements, walking, hidden), { count: unattributed.length, toby: mode.toby }),
    [snapshot, placements, walking, hidden, unattributed.length, mode.toby]);
  return (
    <g className="scene">
      {scene.map((d) => (
        <DrawableView key={d.id} drawable={d} occupant={d.type === 'seat' ? occupants.get(d.id) : undefined} onOpen={onOpenPerson} />
      ))}
    </g>
  );
});

export function OfficeMap({
  snapshot, live, hidden = NOBODY, focusRequest = null, reduceMotion = false, onOpenPerson, onOpenArea, onOpenLedger, onOpenCalendar,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const { view, fit, zoomBy, flyTo, handlers } = usePanZoom(wrap, BOUNDS);
  const { tip, handlers: tipHandlers, showFor, hide } = usePersonTip(wrap);
  const delight = useDelight();
  const placements = useMemo(() => placementsFor(snapshot), [snapshot]); // desks: keyboard order and "show on the map"
  const drawn = useMemo(() => withTrips(placements, delight.trips), [placements, delight.trips]); // where they are drawn
  const creed = { count: delight.unattributed.length, toby: delight.mode.toby };
  const allChips = useMemo(() => decorateChips(chipsFor(snapshot, drawn, DELIGHT_OFFICE), delight.trips, creed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot, drawn, delight.trips, creed.count, creed.toby]);
  const chips = useMemo(() => (hidden.size ? allChips.filter((c) => !hidden.has(c.personId)) : allChips), [allChips, hidden]);
  const signs = useMemo(() => signsFor(snapshot), [snapshot]);
  const clickable = useMemo(() => new Set(signs.filter((s) => s.rooms.length).map((s) => s.area.id)), [signs]);
  const staticScene = useMemo(() => buildScene(OFFICE, []), []);
  const openArea = useCallback((id: string) => onOpenArea(id), [onOpenArea]);
  const needYou = needYouCount(snapshot);
  const phone = useMemo(() => (PHONE ? { x: PHONE.x, y: PHONE.y, count: needYou } : undefined), [needYou]);
  const rows = useMemo(() => readingRows(mapTargets(snapshot, placements, signs, hidden), ROW_PX), [snapshot, placements, signs, hidden]);

  const ensureVisible = useCallback((el: Element) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    const r = el.getBoundingClientRect();
    const inside = r.left >= box.left + EDGE_PX && r.right <= box.right - EDGE_PX && r.top >= box.top + EDGE_PX && r.bottom <= box.bottom - EDGE_PX;
    if (inside) return;
    const at = { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
    hide();
    flyTo((size, from) => centerOn(toWorld(from, at), from.scale, size), { instant: reduceMotion, onDone: () => showFor(document.activeElement) });
  }, [flyTo, hide, showFor, reduceMotion]);

  const keys = useMapKeys(svg, rows, ensureVisible);
  const parkour = useParkour(snapshot);
  useMapFocus({ request: focusRequest, placements, root: svg, flyTo, instant: reduceMotion, beforeFly: hide });
  const onFocus = (e: FocusEvent) => {
    tipHandlers.onFocus(e);
    keys.onFocus(e);
  };

  return (
    <div className={`map-wrap${delight.nodding ? ' is-nodding' : ''}`} data-daylight={delight.daylight ?? undefined} ref={wrap} {...tipHandlers}
      onFocus={onFocus} onKeyDown={keys.onKeyDown} {...parkour}>
      <svg ref={svg} className="office-map" role="group" aria-label="Dunder Mifflin office floor plan" {...handlers}>
        <Defs />
        <rect x={0} y={0} width="100%" height="100%" fill="url(#dm-bg)" />
        <g transform={`translate(${view.x.toFixed(1)} ${view.y.toFixed(1)}) scale(${view.scale.toFixed(4)})`}>
          <Floors office={OFFICE} scene={staticScene} clickableAreas={clickable} onArea={openArea} />
          <SceneLayer snapshot={snapshot} hidden={hidden} onOpenPerson={onOpenPerson} />
          <TrophyLayer placements={drawn} />
          <CreedLayer placements={drawn} />
          <MapEggs snapshot={snapshot} scale={view.scale} />
          <Overlay chips={chips} signs={signs} scale={view.scale} onOpenPerson={onOpenPerson} onOpenArea={openArea} phone={phone} />
          {onOpenLedger && <LedgerSign scale={view.scale} onOpen={onOpenLedger} />}
          {onOpenCalendar && <CommitteePin scale={view.scale} onOpen={onOpenCalendar} />}
        </g>
      </svg>
      {tip && <PersonTip tip={tip} snapshot={snapshot} live={live} />}
      <div className="map-controls" role="toolbar" aria-label="Map zoom">
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoomBy(0.8)} aria-label="Zoom out">−</button>
        <button type="button" onClick={fit} aria-label="Fit the office to the screen">Fit</button>
      </div>
    </div>
  );
}
