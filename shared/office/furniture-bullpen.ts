import type { Furniture } from '../office';

const desk = (id: string, x: number, y: number, facing: 'n' | 'e' | 's' | 'w', items: Furniture['items'], color?: string): Furniture => {
  const deep = facing === 'e' || facing === 'w';
  return { id, kind: 'desk', areaId: 'bullpen', x, y, w: deep ? 1.6 : 3.2, d: deep ? 3.2 : 1.6, facing, items, color };
};
const thing = (id: string, kind: Furniture['kind'], x: number, y: number, w: number, d: number, h?: number, extra: Partial<Furniture> = {}): Furniture => ({
  id, kind, areaId: 'bullpen', x, y, w, d, h, ...extra,
});

export const BULLPEN_FURNITURE: readonly Furniture[] = [
  // Jim and Dwight's L near reception, binders and a plant at Dwight's end
  desk('bp.desk.jim', 20.9, 15.4, 's', ['monitor', 'phone', 'papers', 'mug', 'tray', 'folders']),
  desk('bp.desk.dwight', 22.5, 12.2, 'w', ['monitor', 'bobblehead', 'stapler-jello', 'papers', 'binders', 'tray']),
  thing('bp.binders.jd', 'binder-shelf', 22.3, 10.9, 2, 1.1, 1.3, { facing: 's' }),
  thing('bp.plant.jd', 'plant', 24.5, 11, 0.9, 0.9, 1.9),
  // Phyllis and Stanley, back to back, binders at the end
  desk('bp.desk.phyllis', 28.9, 13.2, 'n', ['monitor', 'plant', 'photo', 'papers', 'mug', 'folders']),
  desk('bp.desk.stanley', 28.9, 14.8, 's', ['monitor', 'papers', 'mug', 'phone', 'lamp', 'tray']),
  thing('bp.binders.ps', 'binder-shelf', 32.3, 13.2, 1.4, 1.2, 1.3, { facing: 's' }),
  // pairs by the front windows: Andy (and a spare), Creed and Meredith
  desk('bp.desk.spare1', 22.9, 2.6, 'e', ['monitor', 'papers', 'tray', 'binders', 'pencup']),
  desk('bp.desk.andy', 24.5, 2.6, 'w', ['monitor', 'mug', 'photo', 'papers', 'folders', 'plant']),
  desk('bp.desk.meredith', 32.7, 2.6, 'e', ['monitor', 'mug', 'papers', 'tray', 'folders', 'plant']),
  desk('bp.desk.creed', 34.3, 2.6, 'w', ['monitor', 'plant', 'papers', 'mug', 'binders', 'lamp']),
  // accounting in the front-left corner
  desk('bp.desk.angela', 12.6, 6.6, 's', ['monitor', 'photo', 'papers', 'binders', 'tray', 'plant']),
  desk('bp.desk.kevin', 12.6, 5, 'n', ['monitor', 'candy', 'papers', 'mug', 'folders', 'tray']),
  desk('bp.desk.oscar', 16.4, 4.8, 'w', ['monitor', 'papers', 'lamp', 'binders', 'mug', 'folders']),
  // spare pair in front of the kitchen
  desk('bp.desk.spare2', 36.6, 10.4, 'n', ['monitor', 'papers', 'binders', 'tray', 'lamp']),
  desk('bp.desk.spare3', 36.6, 12, 's', ['laptop', 'mug', 'papers', 'folders', 'pencup']),

  // low bookshelves between and beside the paired desks, filing cabinets
  thing('bp.shelf.andy', 'binder-shelf', 23.1, 6, 2.8, 1, 1.3, { facing: 's' }),
  thing('bp.shelf.creed', 'binder-shelf', 32.9, 6, 2.8, 1, 1.3, { facing: 's' }),
  thing('bp.shelf.spares', 'supply-shelf', 39.2, 15.6, 1, 2.6, 2.2, { facing: 'w' }),
  thing('bp.shelf.accounting', 'binder-shelf', 11.6, 5.2, 0.9, 2.8, 1.3, { facing: 'w' }),
  thing('bp.files.accounting1', 'cabinet', 15.9, 0.3, 0.9, 1.1, 2),
  thing('bp.files.accounting2', 'cabinet', 16.9, 0.3, 0.9, 1.1, 2),
  thing('bp.files.kitchen', 'cabinet', 39.2, 7.4, 1, 1.4, 1.8, { color: '#d9a441' }),
  thing('bp.files.stanley', 'cabinet', 27.5, 15, 0.9, 1.2, 2),
  // along the walls: accounting's supply cabinets (left wall, front wall and behind the desks, as in the original), the
  // conference room's credenza and printer, the restroom-side bookshelf
  thing('bp.supplies.left', 'supplies', 10.3, 2.3, 1.2, 5.4, 1.2),
  thing('bp.supplies.front', 'supplies', 11.6, 0.3, 4, 1.1, 1.1),
  thing('bp.supplies.back', 'supplies', 10.3, 9.9, 4.4, 1.1, 1.2),
  thing('bp.credenza', 'cabinet', 26.2, 24.6, 4, 1, 1.4, { color: '#b98a5a' }),
  thing('bp.printer', 'copier', 30.6, 24.5, 1.4, 1.1, 1.5),
  thing('bp.bookcase', 'bookshelf', 32.4, 24.9, 1.8, 0.8, 1.8, { facing: 's' }),
  thing('bp.bookshelf.east', 'bookshelf', 39.5, 3, 0.85, 2.8, 2.4, { facing: 'w', color: '#c8734a' }),
  thing('bp.cooler', 'water-cooler', 39.3, 9.25, 0.9, 0.9, 2.4),
  thing('bp.plant1', 'plant', 22.1, 24.9, 0.8, 0.8, 1.9),
  thing('bp.plant2', 'plant', 25, 24.8, 0.9, 0.9, 1.9),
  thing('bp.plant3', 'plant', 39.4, 6.1, 0.9, 0.9, 2),
  thing('bp.plant4', 'plant', 20.6, 2.4, 0.9, 0.9, 1.8),
  thing('bp.bin1', 'bin', 19.9, 15.8, 0.6, 0.6, 0.8),
  thing('bp.bin2', 'bin', 28.1, 13.8, 0.6, 0.6, 0.8),
  thing('bp.bin3', 'bin', 31.8, 6.2, 0.6, 0.6, 0.8),
  thing('bp.bin4', 'bin', 16.2, 8.6, 0.6, 0.6, 0.8),
];
