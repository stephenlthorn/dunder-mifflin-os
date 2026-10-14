// Static office data for Dunder Mifflin OS: areas, walls (with door gaps), furniture, seats and the staff roster.
// Pure data. Units: 1 ≈ 0.5 m; x → right, y → back, z → up. See docs/ARCHITECTURE.md for the floor plan.
import type { Look, Person } from './contract';

export type Facing = 'n' | 'e' | 's' | 'w'; // n = +y (back), e = +x, s = −y (front), w = −x
export type Rect = { x: number; y: number; w: number; h: number };
export type FloorKind = 'carpet' | 'carpet-blue' | 'lino' | 'wood' | 'tile' | 'concrete' | 'slate';

export type Area = {
  id: string;
  name: string;
  rect: Rect;
  floor: FloorKind;
  level: 'main' | 'warehouse';
  sign: { x: number; y: number }; // floor point the room sign hangs over
  /** Extra floor outside `rect` that belongs to the area (the elevator alcove off the lobby, the accounting corner's bay). */
  bays?: readonly Rect[];
};

/** Every floor rectangle of an area: its rect, then its bays. */
export const areaRects = (a: Area): Rect[] => [a.rect, ...(a.bays ?? [])];

/** 'door' is an open doorway (a gap); 'wood-door' a closed door panel; 'window-blinds' a sill with blinds above it. */
export type OpeningKind = 'door' | 'wood-door' | 'window' | 'window-blinds' | 'glass' | 'blinds';
export type Opening = { from: number; to: number; kind: OpeningKind; color?: string /* door leaf colour */ };
/**
 * axis 'x': runs along x at y = at; axis 'y': runs along y at x = at. `color` tints the wall (e.g. the pink restroom).
 * `height` draws the wall taller than the cut-away height (the far exterior walls stand full height, as in the render).
 */
export type Wall = {
  id: string; axis: 'x' | 'y'; at: number; from: number; to: number; exterior?: boolean; color?: string; height?: number; openings?: Opening[];
};

export type DeskItem =
  | 'monitor' | 'laptop' | 'mug' | 'boss-mug' | 'papers' | 'phone' | 'lamp' | 'plant' | 'bobblehead' | 'candy' | 'photo' | 'nameplate'
  | 'stapler-jello' | 'tray' | 'binders' | 'folders' | 'pencup';
export type CounterItem = 'sink' | 'microwave' | 'coffee' | 'toaster';

export type FurnitureKind =
  | 'desk' | 'ledge' | 'table' | 'round-table' | 'chair' | 'armchair' | 'couch' | 'coffee-table'
  | 'copier' | 'it-cart' | 'vending' | 'fridge' | 'counter' | 'cabinet' | 'bookshelf' | 'shelving'
  | 'whiteboard' | 'tv' | 'plant' | 'water-cooler' | 'elevator' | 'stairs' | 'toilet' | 'vanity'
  | 'crates' | 'pallet' | 'rug' | 'mat' | 'kettlebell' | 'floor-mark' | 'bin'
  | 'reception-desk' | 'wall-sign' | 'partition' | 'bulletin' | 'supplies' | 'binder-shelf' | 'tv-stand' | 'supply-shelf'
  | 'wall-cabinets' | 'balustrade' | 'picture';

export type Furniture = {
  id: string;
  kind: FurnitureKind;
  areaId: string;
  x: number;
  y: number;
  w: number; // extent along x
  d: number; // extent along y
  h?: number;
  z?: number;
  facing?: Facing; // which way a desk's user / a chair / a couch faces
  color?: string;
  items?: readonly (DeskItem | CounterItem)[];
  label?: string; // text on a wall sign
};

/** 'none': a place to stand (the delight layer's coffee, vending and water-cooler spots). */
export type ChairStyle = 'office' | 'conference' | 'armchair' | 'stool' | 'forklift' | 'none';
export type Seat = {
  id: string;
  areaId: string;
  x: number;
  y: number;
  facing: Facing;
  kind: 'desk' | 'meeting' | 'spare' | 'spot'; // spot: where an idle bot stands on a coffee run (web/src/delight/ambient)
  chair: ChairStyle;
};

/** Drawing extras the contract's Look has no field for. */
export type LookExtras = { cap?: string; vest?: string };

export type StaffEntry = {
  id: string;
  name: string;
  title: string;
  seatId: string;
  bot?: { profile: string; role: string };
  /** Show `name` even when Hermes has a persona name for the bot; the persona name then appears as a second line. */
  keepName?: boolean;
  look: Look;
  extras?: LookExtras;
};

export type OfficeData = {
  size: { w: number; h: number };
  wallHeight: number; // cut-away height drawn in the render
  areas: readonly Area[];
  walls: readonly Wall[];
  furniture: readonly Furniture[];
  seats: readonly Seat[];
  stairLink: { from: { x: number; y: number }; to: { x: number; y: number } };
};

import { AREAS } from './office/areas';
import { WALLS } from './office/walls';
import { FURNITURE } from './office/furniture';
import { SEATS } from './office/seats';
import { STAFF } from './office/staff';

export { AREAS, WALLS, FURNITURE, SEATS, STAFF };

/** size: the main building's extent (x to the right end, y from the front wall to the back wall). */
export const OFFICE: OfficeData = {
  size: { w: 72, h: 35 },
  wallHeight: 2.5,
  areas: AREAS,
  walls: WALLS,
  furniture: FURNITURE,
  seats: SEATS,
  stairLink: { from: { x: 49.5, y: 33.4 }, to: { x: 30.4, y: 43.8 } },
};

export function toPerson(entry: StaffEntry): Person {
  const { id, name, title, seatId, bot, look } = entry;
  return bot ? { id, name, title, seatId, bot: { ...bot }, look: { ...look } } : { id, name, title, seatId, look: { ...look } };
}

export const STAFF_BY_ID: ReadonlyMap<string, StaffEntry> = new Map(STAFF.map((s) => [s.id, s]));
