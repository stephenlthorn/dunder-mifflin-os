// Where things are on the map, in world-screen pixels (before pan/zoom): keyboard targets in reading order and camera targets.
import type { OfficeSnapshot } from '@shared/contract';
import { OFFICE, type OfficeData, areaRects } from '@shared/office';
import { type Bounds, Z_PX, boundsOf, project, scaleAt } from '../iso/projection';
import type { Placement } from '../office/placement';
import type { SignInfo } from './Overlay';
import type { MapTarget } from './readingOrder';

/** Rows closer than this (world-screen px) read as one row: about a seated figure's height. */
export const ROW_PX = 34;

/** The middle of a seated (or forklift-driving) figure. */
export function personFocusPoint(placements: readonly Placement[], personId: string, office: OfficeData = OFFICE) {
  const pl = placements.find((p) => p.personId === personId);
  const seat = pl && office.seats.find((s) => s.id === pl.seatId);
  if (!seat) return null;
  const p = project({ x: seat.x, y: seat.y });
  const k = scaleAt(seat);
  const lift = (seat.chair === 'forklift' ? 1.15 : 0.92) * Z_PX;
  return { x: p.x + k, y: p.y - (lift + 14) * k };
}

/** Screen bounds of an area's floor (and its bays), up to desk height, for framing it with the camera. */
export function areaFrame(areaId: string, office: OfficeData = OFFICE): Bounds | null {
  const area = office.areas.find((a) => a.id === areaId);
  if (!area) return null;
  return boundsOf(areaRects(area).flatMap(({ x, y, w, h }) =>
    [0, 1.6].flatMap((z) => [project({ x, y, z }), project({ x: x + w, y, z }), project({ x, y: y + h, z }), project({ x: x + w, y: y + h, z })])));
}

/** The accounting corner's sign that opens Angela's ledger (LedgerSign.tsx), on the floor in front of her desk. */
export const LEDGER_SPOT = { x: 13.2, y: 1.2 };
export const LEDGER_SIGN_ID = 'ledger'; // its data-area-sign, so the keyboard walks it like a room sign

/** Everyone not hidden by the fleet filter, plus each room sign you can open and the ledger sign. Keys: `person:<id>`, `area:<id>`. */
export function mapTargets(s: OfficeSnapshot, placements: readonly Placement[], signs: readonly SignInfo[], hidden: ReadonlySet<string>): MapTarget[] {
  const people = s.people.flatMap((p) => {
    if (hidden.has(p.id)) return [];
    const pt = personFocusPoint(placements, p.id);
    return pt ? [{ key: `person:${p.id}`, ...pt }] : [];
  });
  const rooms = signs.filter((sg) => sg.rooms.length > 0).map((sg) => ({ key: `area:${sg.area.id}`, ...project(sg.area.sign) }));
  return [...people, ...rooms, { key: `area:${LEDGER_SIGN_ID}`, ...project(LEDGER_SPOT) }];
}
