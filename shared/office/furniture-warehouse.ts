import type { Furniture } from '../office';

// The warehouse is an inset floor drawn behind the building, reached by the stairwell's stairs.
export const WAREHOUSE_FURNITURE: readonly Furniture[] = [
  { id: 'wh.stairs', kind: 'stairs', areaId: 'warehouse', x: 29.2, y: 41.4, w: 2.4, d: 4, facing: 'n' },
  { id: 'wh.shelf1', kind: 'shelving', areaId: 'warehouse', x: 19, y: 49.2, w: 9, d: 1.4, h: 3.2 },
  { id: 'wh.shelf2', kind: 'shelving', areaId: 'warehouse', x: 19, y: 45.6, w: 9, d: 1.4, h: 3 },
  { id: 'wh.crates1', kind: 'crates', areaId: 'warehouse', x: 12.6, y: 41.6, w: 1.6, d: 1.6, h: 1.8 },
  { id: 'wh.crates2', kind: 'crates', areaId: 'warehouse', x: 14.5, y: 41.6, w: 1.6, d: 1.6, h: 1.1 },
  { id: 'wh.crates3', kind: 'crates', areaId: 'warehouse', x: 12.6, y: 43.6, w: 1.8, d: 1.6, h: 1.3 },
  { id: 'wh.pallet', kind: 'pallet', areaId: 'warehouse', x: 26.4, y: 41.6, w: 1.8, d: 1.6, h: 0.3 },
  { id: 'wh.crates4', kind: 'crates', areaId: 'warehouse', x: 29.4, y: 47, w: 1.6, d: 1.6, h: 1.2 },
  { id: 'wh.mark1', kind: 'floor-mark', areaId: 'warehouse', x: 18.4, y: 44.9, w: 10.2, d: 0.2, color: '#e9b824' },
  { id: 'wh.mark2', kind: 'floor-mark', areaId: 'warehouse', x: 21.5, y: 41.4, w: 0.2, d: 3.4, color: '#e9b824' },
  { id: 'wh.office.desk', kind: 'desk', areaId: 'warehouse', x: 13.2, y: 47.8, w: 3.2, d: 1.6, facing: 's', items: ['monitor', 'papers', 'mug', 'folders', 'tray'] },
  { id: 'wh.office.cabinet', kind: 'cabinet', areaId: 'warehouse', x: 16.4, y: 49.6, w: 0.8, d: 1.1, h: 2 },
  { id: 'wh.office.plant', kind: 'plant', areaId: 'warehouse', x: 12.3, y: 46.8, w: 0.7, d: 0.7, h: 1.5 },
];
