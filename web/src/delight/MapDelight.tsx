// The delight layer on the map, above the drawing and below the chips: Dundie trophies on the winners' desks, Creed's
// thought bubble, and the easter eggs you can click (the World's Best Boss mug, Stanley's crossword). Nothing here
// blocks a click on anything else; trophies and the bubble take no pointer events at all. (The light through the
// windows is CSS on the map: data-daylight.)
import { memo, useMemo } from 'react';
import type { OfficeSnapshot } from '@shared/contract';
import { FURNITURE } from '@shared/office';
import { Z_PX, project, scaleAt } from '../iso/projection';
import type { Placement } from '../office/placement';
import { furnitureParts } from '../map/parts/furnitureParts';
import { partBox } from '../map/parts/parts';
import { DELIGHT_SEATS } from './ambient/spots';
import { useDelight } from './DelightContext';
import { CREED_DESK, CreedNote } from './creed/CreedNote';
import { Trophy } from './dundies/Trophy';
import { trophySpot } from './dundies/trophySpot';
import { bossMugLine } from './eggs/bossMug';
import { crosswordClue, crosswordTime, isPretzelDay, pretzelLine } from './eggs/crossword';

function topOf(partClass: string, furnitureId?: string) {
  const f = FURNITURE.find((x) => (furnitureId ? x.id === furnitureId : furnitureParts(x).some((p) => p.className === partClass)));
  const part = f && furnitureParts(f).find((p) => p.className === partClass);
  if (!f || !part) return null;
  const b = partBox(part);
  return { x: b.x + b.w / 2, y: b.y + b.d / 2, z: b.z + b.h };
}

const MUG = topOf('boss-mug');
const STANLEY = (() => {
  const desk = FURNITURE.find((f) => f.id === 'bp.desk.stanley');
  return desk ? { x: desk.x + desk.w * 0.3, y: desk.y + desk.d * 0.55, z: 1.5 } : null;
})();

export const TrophyLayer = memo(function TrophyLayer({ placements }: { placements: readonly Placement[] }) {
  const { trophies } = useDelight();
  const shown = placements.flatMap((pl) => {
    const won = trophies.get(pl.personId);
    const seat = !pl.away && won ? DELIGHT_SEATS.find((s) => s.id === pl.seatId) : undefined;
    if (!seat || !won) return [];
    const spot = trophySpot(seat);
    return [{ id: pl.personId, p: project(spot), k: scaleAt(spot), n: won.length }];
  });
  return (
    <g className="trophies">
      {shown.map((t) => <g key={t.id} data-trophy-for={t.id} transform={`translate(${t.p.x.toFixed(1)} ${t.p.y.toFixed(1)}) scale(${(t.k * 1.15).toFixed(3)})`}><Trophy count={t.n} /></g>)}
    </g>
  );
});

/** Creed's thought bubble, above the drawing so the desk clutter in front of him never hides it. */
export const CreedLayer = memo(function CreedLayer({ placements }: { placements: readonly Placement[] }) {
  const { mode, unattributed } = useDelight();
  const pl = placements.find((p) => p.personId === CREED_DESK);
  const seat = pl && DELIGHT_SEATS.find((s) => s.id === pl.seatId);
  if (!mode.jokes || !seat || unattributed.length === 0) return null;
  const at = project({ x: seat.x, y: seat.y });
  const k = scaleAt(seat);
  return <g transform={`translate(${at.x.toFixed(1)} ${(at.y - 0.92 * Z_PX * k).toFixed(1)}) scale(${k.toFixed(3)})`}><CreedNote count={unattributed.length} /></g>;
});

function Egg({ at, k, label, className, onClick, children }: { at: { x: number; y: number }; k: number; label: string; className: string; onClick: () => void; children?: React.ReactNode }) {
  return (
    <g className={`map-egg ${className}`} transform={`translate(${at.x.toFixed(1)} ${at.y.toFixed(1)}) scale(${k.toFixed(3)})`}
      onClick={(e) => { e.stopPropagation(); onClick(); }} aria-hidden="true">
      <title>{label}</title>
      {children}
      <circle r={9} fill="transparent" />
    </g>
  );
}

export function MapEggs({ snapshot, scale }: { snapshot: OfficeSnapshot; scale: number }) {
  const { mode, toast, wallClock, officeNow } = useDelight();
  const k = Math.min(1.4, Math.max(0.5, 1 / scale));
  const mug = useMemo(() => (MUG ? project(MUG) : null), []);
  const stanley = useMemo(() => (STANLEY ? project(STANLEY) : null), []);
  if (!mode.eggs) return null;
  const today = wallClock();
  const pretzel = isPretzelDay(today);
  const crossword = pretzel || crosswordTime(today);
  return (
    <g className="map-eggs">
      {mug && <Egg at={mug} k={k} label="World’s Best Boss" className="egg-mug" onClick={() => toast(bossMugLine(snapshot, officeNow()))} />}
      {stanley && crossword && (
        <Egg at={stanley} k={k} label={pretzel ? 'Pretzel Day' : 'Stanley’s crossword'} className={pretzel ? 'egg-pretzel' : 'egg-crossword'}
          onClick={() => {
            const clue = crosswordClue(snapshot, today);
            toast(pretzel ? { text: 'Pretzel Day!', sub: pretzelLine(snapshot, today) } : { text: 'Stanley’s crossword', sub: `${clue.clue}: ${clue.answer}` });
          }}>
          {pretzel
            ? <path data-pretzel="" d="M-5 -2C-8 -6 -3 -9 0 -5C3 -9 8 -6 5 -2C3 1 -3 1 -5 -2ZM-2 -4L2 -1M2 -4L-2 -1" stroke="#9a5b1e" strokeWidth={1.8} fill="none" strokeLinecap="round" />
            : (
              <g data-crossword="">
                <rect x={-6} y={-8} width={12} height={9} rx={0.8} fill="#f4f1e8" stroke="#8a7f70" strokeWidth={0.5} />
                {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => (
                  <rect key={`${r}-${c}`} x={-5 + c * 2.6} y={-7 + r * 2.6} width={2.2} height={2.2} fill={(r + c) % 3 === 0 ? '#2d2a26' : '#ffffff'} stroke="#b9ab95" strokeWidth={0.2} />
                )))}
              </g>
            )}
        </Egg>
      )}
    </g>
  );
}
