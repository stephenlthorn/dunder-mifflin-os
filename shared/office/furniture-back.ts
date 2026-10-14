import type { Furniture } from '../office';

const chair = (id: string, areaId: string, x: number, y: number, facing: Furniture['facing'], color?: string): Furniture => ({
  id, kind: 'chair', areaId, x: x - 0.55, y: y - 0.55, w: 1.1, d: 1.1, facing, color,
});
const table = (id: string, cx: number, cy: number, r: number): Furniture => ({
  id, kind: 'round-table', areaId: 'breakroom', x: cx - r, y: cy - r, w: r * 2, d: r * 2, h: 1.5,
});

// Kitchen, restrooms, break room and the Annex (the right half of the building).
export const BACK_FURNITURE: readonly Furniture[] = [
  // the kitchen in front of the stair room: white cabinets, counter and fridge along the stair room's front wall,
  // two doormats, Sensei Ira's round table; his exercise corner in the bay by the restrooms; a waiting nook in the back passage
  { id: 'kit.counter', kind: 'counter', areaId: 'kitchen', x: 41.8, y: 21.1, w: 7.8, d: 1.25, h: 1.8, items: ['coffee', 'sink', 'toaster', 'microwave'] },
  { id: 'kit.uppers', kind: 'wall-cabinets', areaId: 'kitchen', x: 41.8, y: 21.65, w: 7.8, d: 0.7, z: 2.55, h: 0.95 },
  { id: 'kit.fridge', kind: 'fridge', areaId: 'kitchen', x: 49.7, y: 20.8, w: 1.75, d: 1.55, h: 3.4 },
  { id: 'kit.doormat', kind: 'mat', areaId: 'kitchen', x: 43.4, y: 19.3, w: 2.2, d: 1.5, color: '#7b2f35' },
  { id: 'kit.doormat2', kind: 'mat', areaId: 'kitchen', x: 45.9, y: 19.3, w: 2.2, d: 1.5, color: '#6b3a2c' },
  { id: 'kit.table', kind: 'round-table', areaId: 'kitchen', x: 49.2, y: 16.2, w: 2.4, d: 2.4, h: 1.5, items: ['mug'] },
  chair('kit.chair1', 'kitchen', 47.65, 17.4, 'e'),
  chair('kit.chair2', 'kitchen', 52.15, 17.4, 'w'),
  chair('kit.chair3', 'kitchen', 50.4, 15.65, 'n'),
  { id: 'kit.plant', kind: 'plant', areaId: 'kitchen', x: 52.9, y: 18.9, w: 0.9, d: 0.9, h: 2.2 },
  { id: 'kit.board', kind: 'bulletin', areaId: 'kitchen', x: 53.6, y: 15.2, w: 0.25, d: 2.4, z: 0.9, h: 1.4, facing: 'w' },
  { id: 'kit.bin', kind: 'bin', areaId: 'kitchen', x: 41, y: 17.8, w: 0.7, d: 0.7, h: 1 },
  { id: 'kit.yoga', kind: 'mat', areaId: 'kitchen', x: 46.4, y: 10.2, w: 1.6, d: 3.4, color: '#5f9e8a' },
  { id: 'kit.kettlebell', kind: 'kettlebell', areaId: 'kitchen', x: 48.8, y: 12.6, w: 0.6, d: 0.6, h: 0.7 },
  { id: 'kit.cooler', kind: 'water-cooler', areaId: 'kitchen', x: 52.8, y: 13.6, w: 0.9, d: 0.9, h: 2.4 },
  // the waiting nook between the stair room and the break room (it opens onto the annex): couch, chairs, plant, bin
  { id: 'kit.couch', kind: 'couch', areaId: 'annex', x: 54.3, y: 27.2, w: 1.3, d: 4, facing: 'e', color: '#9ea4aa' },
  { id: 'kit.plant2', kind: 'plant', areaId: 'annex', x: 55, y: 33.6, w: 0.9, d: 0.9, h: 2.2 },
  { id: 'kit.recycle', kind: 'bin', areaId: 'annex', x: 56.1, y: 33.9, w: 0.8, d: 0.8, h: 1.1, color: '#2e5fb7' },

  // men's room (blue), women's room (pink, with a lounge chair and a bench in the front bay)
  { id: 'wc.m.toilet', kind: 'toilet', areaId: 'restrooms', x: 44.5, y: -1.75, w: 1, d: 1.3, h: 1.2 },
  { id: 'wc.m.stall', kind: 'partition', areaId: 'restrooms', x: 46.1, y: 4.6, w: 1, d: 0.15, h: 2, color: '#3d7ea6' },
  { id: 'wc.m.vanity', kind: 'vanity', areaId: 'restrooms', x: 40.8, y: 5.6, w: 0.9, d: 1.6, h: 1.5 },
  { id: 'wc.m.vanity2', kind: 'vanity', areaId: 'restrooms', x: 40.8, y: 7.2, w: 0.9, d: 1.6, h: 1.5 },
  { id: 'wc.w.toilet', kind: 'toilet', areaId: 'restrooms', x: 49.1, y: -1.75, w: 1, d: 1.3, h: 1.2 },
  { id: 'wc.w.stall', kind: 'partition', areaId: 'restrooms', x: 49, y: 7, w: 0.15, d: 1.8, h: 2, color: '#d9a3ad' },
  { id: 'wc.w.vanity', kind: 'vanity', areaId: 'restrooms', x: 47.6, y: 4.4, w: 0.9, d: 1.6, h: 1.5 },
  { id: 'wc.w.lounge', kind: 'armchair', areaId: 'restrooms', x: 49.4, y: 6.6, w: 1.4, d: 1.4, facing: 's', color: '#e7a9b8' },
  { id: 'wc.w.bench', kind: 'couch', areaId: 'restrooms', x: 50.6, y: 2.6, w: 1.2, d: 3, facing: 'w', color: '#c0392b' },

  { id: 'brk.vend.drinks', kind: 'vending', areaId: 'breakroom', x: 63.6, y: 33.3, w: 2, d: 1.5, h: 3.6, color: '#2e5fb7' },
  { id: 'brk.vend.snacks1', kind: 'vending', areaId: 'breakroom', x: 65.6, y: 33.3, w: 2, d: 1.5, h: 3.6, color: '#9aa0a8' },
  { id: 'brk.vend.snacks2', kind: 'vending', areaId: 'breakroom', x: 67.6, y: 33.3, w: 2, d: 1.5, h: 3.6, color: '#b9bec4' },
  { id: 'brk.vend.coffee', kind: 'vending', areaId: 'breakroom', x: 69.6, y: 33.3, w: 2, d: 1.5, h: 3.4, color: '#2b2f36' },
  table('brk.table1', 64.4, 31, 1),
  table('brk.table2', 67.4, 28.9, 1),
  table('brk.table3', 70.4, 31.1, 1),
  chair('brk.chair1', 'breakroom', 62.75, 31, 'e'),
  chair('brk.chair2', 'breakroom', 68.8, 31.1, 'e'),
  chair('brk.chair3', 'breakroom', 70.4, 29.5, 'n'),
  { id: 'brk.lounge1', kind: 'armchair', areaId: 'annex', x: 57.4, y: 33.3, w: 1.3, d: 1.3, facing: 's', color: '#2d3035' },
  { id: 'brk.lounge2', kind: 'armchair', areaId: 'annex', x: 58.9, y: 33.3, w: 1.3, d: 1.3, facing: 's', color: '#2d3035' },
  { id: 'brk.plant', kind: 'plant', areaId: 'breakroom', x: 62.3, y: 32.4, w: 0.9, d: 0.9, h: 2 },
  { id: 'brk.plant2', kind: 'plant', areaId: 'breakroom', x: 70.9, y: 26.4, w: 0.9, d: 0.9, h: 2.1 },
  { id: 'brk.board', kind: 'bulletin', areaId: 'breakroom', x: 62.3, y: 34.55, w: 1.2, d: 0.25, z: 1.2, h: 1.3, facing: 's' },
  { id: 'brk.bin', kind: 'bin', areaId: 'breakroom', x: 71.1, y: 27.5, w: 0.7, d: 0.7, h: 1.1 },

  // the Annex: Kelly by the break room, Ryan's cubicle, Toby and the HR wall, Holly's long desk at the front
  { id: 'anx.kelly.desk', kind: 'desk', areaId: 'annex', x: 65.7, y: 16.6, w: 3.2, d: 1.6, facing: 's', items: ['monitor', 'mug', 'photo', 'candy', 'papers', 'plant'] },
  { id: 'anx.files.kelly', kind: 'cabinet', areaId: 'annex', x: 69.9, y: 13, w: 1.9, d: 3.4, h: 2.4 },
  { id: 'anx.ryan.desk', kind: 'desk', areaId: 'annex', x: 66.2, y: 3.5, w: 3.2, d: 1.6, facing: 's', items: ['laptop', 'mug', 'papers', 'pencup', 'folders'] },
  { id: 'anx.ryan.back', kind: 'partition', areaId: 'annex', x: 69.8, y: 3.3, w: 0.2, d: 3, h: 2.3, color: '#9aa4ab' },
  { id: 'anx.cube2.desk', kind: 'desk', areaId: 'annex', x: 60.3, y: 12, w: 3.2, d: 1.6, facing: 's', items: ['monitor', 'papers', 'phone', 'tray', 'binders'] },
  chair('anx.cube2.chair', 'annex', 61.9, 14.4, 's'),
  { id: 'anx.cube2.back', kind: 'partition', areaId: 'annex', x: 59.7, y: 15.4, w: 4.4, d: 0.2, h: 2.3 },
  { id: 'anx.ryan.side', kind: 'partition', areaId: 'annex', x: 65.6, y: 3.3, w: 0.2, d: 3.3, h: 2.3, color: '#9aa4ab' },
  { id: 'anx.toby.desk', kind: 'desk', areaId: 'annex', x: 67.9, y: 6.7, w: 3.2, d: 1.6, facing: 's', items: ['monitor', 'papers', 'photo', 'mug', 'tray', 'folders'] },
  { id: 'anx.hr.board', kind: 'bulletin', areaId: 'annex', x: 71.55, y: 6, w: 0.25, d: 4.2, z: 0.9, h: 1.4, facing: 'w' },
  { id: 'anx.hr.files', kind: 'cabinet', areaId: 'annex', x: 70.3, y: 19.4, w: 1.5, d: 3.2, h: 2.4 },
  { id: 'anx.hr.cooler', kind: 'water-cooler', areaId: 'annex', x: 70.6, y: 10.4, w: 0.9, d: 0.9, h: 2.4 },
  { id: 'anx.plant3', kind: 'plant', areaId: 'annex', x: 67.4, y: 24.6, w: 0.9, d: 0.9, h: 2 },
  { id: 'anx.holly.desk', kind: 'desk', areaId: 'annex', x: 64.8, y: 0.3, w: 4.8, d: 1.7, facing: 's', items: ['monitor', 'plant', 'papers', 'mug', 'lamp', 'tray'] },
  { id: 'anx.copier', kind: 'copier', areaId: 'annex', x: 52.2, y: 0.4, w: 1.6, d: 1.3, h: 1.7 },
  { id: 'anx.files', kind: 'cabinet', areaId: 'annex', x: 52.3, y: 4, w: 1.1, d: 2.6, h: 2 },
  { id: 'anx.plant1', kind: 'plant', areaId: 'annex', x: 70.9, y: 0.3, w: 0.9, d: 0.9, h: 2 },
  { id: 'anx.plant2', kind: 'plant', areaId: 'annex', x: 60.3, y: 0.4, w: 0.9, d: 0.9, h: 1.9 },
  { id: 'anx.bin', kind: 'bin', areaId: 'annex', x: 59.6, y: 6.4, w: 0.7, d: 0.7, h: 1, color: '#2e5fb7' },
  // by the restroom block, as in the original: a white desk, low binder shelving and a glass partition
  { id: 'anx.front.desk', kind: 'desk', areaId: 'annex', x: 56.6, y: 2.4, w: 3.2, d: 1.6, facing: 's', color: '#e9e6de', items: ['monitor', 'papers', 'phone', 'tray', 'folders'] },
  { id: 'anx.front.binders', kind: 'binder-shelf', areaId: 'annex', x: 56.6, y: 5, w: 2.8, d: 1, h: 1.3, facing: 's' },
  { id: 'anx.front.partition', kind: 'partition', areaId: 'annex', x: 61.4, y: 1, w: 0.2, d: 5, h: 2.3, color: '#9aa4ab' },
];
