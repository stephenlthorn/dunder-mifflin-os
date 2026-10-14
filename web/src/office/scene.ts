// Build the depth-sorted list of everything standing on the floor: wall pieces, furniture and seats (with occupants).
import type { Furniture, FurnitureKind, OfficeData, Seat } from '@shared/office';
import { depthSort } from '../iso/depth';
import type { Box3 } from '../iso/projection';
import type { Placement } from './placement';
import { type WallPiece, wallPieces } from './walls';

export type Drawable =
  | { id: string; type: 'wall'; box: Box3; piece: WallPiece }
  | { id: string; type: 'furniture'; box: Box3; item: Furniture }
  | { id: string; type: 'seat'; box: Box3; seat: Seat; occupantId?: string; away: boolean };

const FLAT: ReadonlySet<FurnitureKind> = new Set(['rug', 'mat', 'floor-mark']);

const HEIGHT: Partial<Record<FurnitureKind, number>> = {
  desk: 1.5, ledge: 1.9, table: 1.5, 'round-table': 1.5, chair: 2, armchair: 1.8, couch: 1.6, 'coffee-table': 0.8,
  copier: 2, 'it-cart': 1.5, vending: 3.6, fridge: 3.6, counter: 1.8, cabinet: 2, bookshelf: 3, shelving: 3,
  whiteboard: 1.6, tv: 1.4, plant: 1.8, 'water-cooler': 2.4, elevator: 2.7, stairs: 2.4, toilet: 1.2, vanity: 1.5,
  crates: 1.2, pallet: 0.3, kettlebell: 0.7, bin: 0.9,
  'reception-desk': 1.9, 'wall-sign': 1.3, partition: 2.3, bulletin: 1.4, supplies: 1.6, 'binder-shelf': 1.3, 'tv-stand': 2.4,
  'supply-shelf': 2.2, 'wall-cabinets': 0.95, balustrade: 1.3, picture: 0.9,
};

/** Seated figures stand this tall (chair + chibi head), so they sort against desks and walls correctly. */
export const SEAT_HEIGHT = 2.9;
const CHAIR_HALF = 0.6;

export function furnitureBox(f: Furniture): Box3 {
  return { x: f.x, y: f.y, z: f.z ?? 0, w: f.w, d: f.d, h: f.h ?? HEIGHT[f.kind] ?? 1 };
}

export function seatBox(seat: Seat): Box3 {
  if (seat.chair === 'forklift') {
    const along = { back: 1.2, front: 2.6, half: 0.8 };
    switch (seat.facing) {
      case 'w': return { x: seat.x - along.front, y: seat.y - along.half, z: 0, w: along.front + along.back, d: along.half * 2, h: 3.2 };
      case 'e': return { x: seat.x - along.back, y: seat.y - along.half, z: 0, w: along.front + along.back, d: along.half * 2, h: 3.2 };
      case 's': return { x: seat.x - along.half, y: seat.y - along.front, z: 0, w: along.half * 2, d: along.front + along.back, h: 3.2 };
      default: return { x: seat.x - along.half, y: seat.y - along.back, z: 0, w: along.half * 2, d: along.front + along.back, h: 3.2 };
    }
  }
  return { x: seat.x - CHAIR_HALF, y: seat.y - CHAIR_HALF, z: 0, w: CHAIR_HALF * 2, d: CHAIR_HALF * 2, h: SEAT_HEIGHT };
}

export const flatFurniture = (office: OfficeData): Furniture[] => office.furniture.filter((f) => FLAT.has(f.kind));

export function buildScene(office: OfficeData, placements: readonly Placement[]): Drawable[] {
  const bySeat = new Map(placements.map((p) => [p.seatId, p]));
  const walls: Drawable[] = wallPieces(office.walls, office.wallHeight).map((piece) => ({ id: piece.id, type: 'wall', box: piece.box, piece }));
  const furniture: Drawable[] = office.furniture
    .filter((f) => !FLAT.has(f.kind))
    .map((item) => ({ id: item.id, type: 'furniture', box: furnitureBox(item), item }));
  const seats: Drawable[] = office.seats.map((seat) => {
    const p = bySeat.get(seat.id);
    return { id: seat.id, type: 'seat', box: seatBox(seat), seat, occupantId: p?.personId, away: p?.away ?? false };
  });
  return depthSort([...walls, ...furniture, ...seats]);
}
