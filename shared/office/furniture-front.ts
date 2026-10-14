import type { Furniture } from '../office';

const chair = (id: string, areaId: string, x: number, y: number, facing: Furniture['facing'], color?: string): Furniture => ({
  id, kind: 'chair', areaId, x: x - 0.55, y: y - 0.55, w: 1.1, d: 1.1, facing, color,
});

// Elevator hallway, reception, Michael's office, conference room and stairwell (the left end and the back row).
export const FRONT_FURNITURE: readonly Furniture[] = [
  { id: 'lobby.sign', kind: 'wall-sign', areaId: 'lobby', x: -1.6, y: 34.55, w: 5.8, d: 0.25, z: 1.5, h: 2.3, facing: 's', label: 'DUNDER MIFFLIN' },
  // the elevator alcove: an open brushed-steel car, its doors on the hallway side
  { id: 'lobby.elevator', kind: 'elevator', areaId: 'lobby', x: 1.2, y: 19.7, w: 5.6, d: 6.1, h: 2.7, facing: 'n' },
  { id: 'lobby.plant1', kind: 'plant', areaId: 'lobby', x: 11.9, y: 33.9, w: 0.9, d: 0.9, h: 2.1 },
  { id: 'lobby.plant2', kind: 'plant', areaId: 'lobby', x: -6.5, y: 22.9, w: 1.2, d: 1.2, h: 2.2 },
  { id: 'lobby.table', kind: 'coffee-table', areaId: 'lobby', x: 11, y: 30.7, w: 1, d: 1, h: 0.8, items: ['papers'] },
  { id: 'lobby.bin', kind: 'bin', areaId: 'lobby', x: -3.6, y: 34.1, w: 0.5, d: 0.5, h: 1 },

  { id: 'rec.sofa', kind: 'couch', areaId: 'reception', x: 10.3, y: 21.8, w: 1.5, d: 2.6, facing: 'e', color: '#9ea4aa' },
  { id: 'rec.lamp-table', kind: 'coffee-table', areaId: 'reception', x: 10.3, y: 20.8, w: 1, d: 0.9, h: 1, items: ['mug'] },
  { id: 'rec.armchair', kind: 'armchair', areaId: 'reception', x: 14.5, y: 21.8, w: 1.3, d: 1.3, facing: 's', color: '#9ea4aa' },
  { id: 'rec.side', kind: 'cabinet', areaId: 'reception', x: 15.1, y: 24.9, w: 1, d: 0.8, h: 1, color: '#6b4a33' },
  { id: 'rec.desk', kind: 'reception-desk', areaId: 'reception', x: 13.7, y: 13.6, w: 2.4, d: 5.2, facing: 'w' },
  { id: 'rec.erin', kind: 'desk', areaId: 'reception', x: 10.4, y: 14.5, w: 1.6, d: 3.2, facing: 'w', items: ['monitor', 'phone', 'papers', 'mug', 'tray', 'plant'] },
  { id: 'rec.binders', kind: 'supply-shelf', areaId: 'reception', x: 10.3, y: 11.3, w: 2.1, d: 1, h: 2.2, facing: 's' },
  { id: 'rec.supplies', kind: 'supplies', areaId: 'reception', x: 12.6, y: 11.4, w: 4.8, d: 1.2, h: 1.2 },
  { id: 'rec.copier', kind: 'copier', areaId: 'reception', x: 17.8, y: 11.3, w: 2, d: 1.5, h: 2 },
  { id: 'rec.it-cart', kind: 'it-cart', areaId: 'reception', x: 20.2, y: 11.4, w: 1.4, d: 1.1, h: 1.5 },
  { id: 'rec.jarvis', kind: 'desk', areaId: 'reception', x: 18.6, y: 20.8, w: 3.2, d: 1.6, facing: 's', items: ['laptop', 'papers', 'pencup', 'folders', 'mug', 'tray'] },
  { id: 'rec.plant', kind: 'plant', areaId: 'reception', x: 16.4, y: 25, w: 0.8, d: 0.8, h: 1.8 },

  { id: 'mich.desk', kind: 'desk', areaId: 'michael', x: 15.6, y: 30.2, w: 3.8, d: 1.7, facing: 's', color: '#6b4a33',
    items: ['monitor', 'boss-mug', 'nameplate', 'papers', 'phone', 'lamp'] },
  chair('mich.guest1', 'michael', 16.5, 28.9, 'n', '#3b3f46'),
  chair('mich.guest2', 'michael', 18.6, 28.9, 'n', '#3b3f46'),
  { id: 'mich.armoire', kind: 'cabinet', areaId: 'michael', x: 20.6, y: 33.4, w: 2, d: 1.3, h: 3, color: '#7a5538' },
  { id: 'mich.credenza', kind: 'cabinet', areaId: 'michael', x: 14.6, y: 34, w: 2.8, d: 0.75, h: 1.3, color: '#6b4a33' },
  { id: 'mich.side', kind: 'cabinet', areaId: 'michael', x: 21.4, y: 28.4, w: 1.3, d: 1.3, h: 1.1, color: '#d9b25a' },
  { id: 'mich.files', kind: 'cabinet', areaId: 'michael', x: 13.3, y: 26.4, w: 1, d: 1.4, h: 2 },
  { id: 'mich.plant', kind: 'plant', areaId: 'michael', x: 13.4, y: 33.8, w: 1, d: 1, h: 2.2 },

  { id: 'conf.screen', kind: 'tv-stand', areaId: 'conference', x: 25, y: 28.6, w: 0.8, d: 3.8, h: 2.4, facing: 'e' },
  { id: 'conf.credenza', kind: 'cabinet', areaId: 'conference', x: 24.9, y: 34, w: 2.2, d: 0.75, h: 1.3, color: '#7a5538' },
  { id: 'conf.coffee', kind: 'cabinet', areaId: 'conference', x: 38.9, y: 33.6, w: 1.3, d: 1.1, h: 1.9, color: '#2d3035' },
  { id: 'conf.whiteboard', kind: 'whiteboard', areaId: 'conference', x: 40.1, y: 27.8, w: 0.25, d: 3.8, z: 0.8, h: 1.4 },
  { id: 'conf.plant', kind: 'plant', areaId: 'conference', x: 39.4, y: 26.3, w: 0.9, d: 0.9, h: 1.8 },
  // chair rows facing the screen; the ten meeting seats are in seats.ts, these fill out the rows
  chair('conf.chair.c1', 'conference', 32.1, 31.2, 'w'),
  chair('conf.chair.c2', 'conference', 32.1, 33, 'w'),
  chair('conf.chair.d1', 'conference', 34.1, 27.6, 'w'),
  chair('conf.chair.d2', 'conference', 34.1, 29.4, 'w'),
  chair('conf.chair.d3', 'conference', 34.1, 31.2, 'w'),
  chair('conf.chair.e1', 'conference', 36.1, 27.6, 'w'),
  chair('conf.chair.e2', 'conference', 36.1, 29.4, 'w'),
  chair('conf.chair.e3', 'conference', 36.1, 31.2, 'w'),

  // the stairwell: framed pictures along the corridor to the stair door; inside the stair room a grey strip by the door
  // wall, a white half-wall with a handrail, and red-carpet stairs rising toward the back onto a raised red landing
  { id: 'stw.pic1', kind: 'picture', areaId: 'stairwell', x: 43.65, y: 27.1, w: 0.2, d: 1.2, z: 1.3, h: 0.9, facing: 'w', color: '#5d7f9e' },
  { id: 'stw.pic2', kind: 'picture', areaId: 'stairwell', x: 43.65, y: 28.8, w: 0.2, d: 1.2, z: 1.3, h: 0.9, facing: 'w', color: '#7a9a6b' },
  { id: 'stw.pic3', kind: 'picture', areaId: 'stairwell', x: 43.65, y: 30.5, w: 0.2, d: 1.2, z: 1.3, h: 0.9, facing: 'w', color: '#3f4a57' },
  { id: 'stw.carpet', kind: 'mat', areaId: 'stairwell', x: 46.95, y: 22.65, w: 6.9, d: 12.15, color: '#7b2f35' },
  { id: 'stw.stairs', kind: 'stairs', areaId: 'stairwell', x: 47.1, y: 23, w: 6.7, d: 11.8, h: 2.4, facing: 'n', color: '#8a3a40' },
  { id: 'stw.balustrade', kind: 'balustrade', areaId: 'stairwell', x: 46.6, y: 23, w: 0.35, d: 8.6, h: 1.4 },
];
