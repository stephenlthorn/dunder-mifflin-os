import type { Seat } from '../office';

export const SEATS: readonly Seat[] = [
  // elevator lobby + reception
  { id: 'seat.david', areaId: 'lobby', x: 11.5, y: 29.6, facing: 'w', kind: 'desk', chair: 'armchair' },
  { id: 'seat.pam', areaId: 'reception', x: 16.8, y: 16.2, facing: 'w', kind: 'desk', chair: 'office' },
  { id: 'seat.erin', areaId: 'reception', x: 12.7, y: 16.1, facing: 'w', kind: 'desk', chair: 'office' },
  { id: 'seat.jarvis', areaId: 'reception', x: 20.1, y: 23.2, facing: 's', kind: 'desk', chair: 'office' },
  { id: 'seat.sadiq', areaId: 'reception', x: 20.9, y: 13.4, facing: 's', kind: 'desk', chair: 'stool' },
  // Michael's office
  { id: 'seat.michael', areaId: 'michael', x: 17.5, y: 32.7, facing: 's', kind: 'desk', chair: 'office' },
  // bullpen: Jim/Dwight L, Phyllis/Stanley, the front pairs, accounting, spares
  { id: 'seat.jim', areaId: 'bullpen', x: 22.5, y: 17.8, facing: 's', kind: 'desk', chair: 'office' },
  { id: 'seat.dwight', areaId: 'bullpen', x: 24.8, y: 13.8, facing: 'w', kind: 'desk', chair: 'office' },
  { id: 'seat.andy', areaId: 'bullpen', x: 26.8, y: 4.2, facing: 'w', kind: 'desk', chair: 'office' },
  { id: 'seat.spare.1', areaId: 'bullpen', x: 22.2, y: 4.2, facing: 'e', kind: 'spare', chair: 'office' },
  { id: 'seat.phyllis', areaId: 'bullpen', x: 30.5, y: 12.5, facing: 'n', kind: 'desk', chair: 'office' },
  { id: 'seat.stanley', areaId: 'bullpen', x: 30.5, y: 17.2, facing: 's', kind: 'desk', chair: 'office' },
  { id: 'seat.meredith', areaId: 'bullpen', x: 32, y: 4.2, facing: 'e', kind: 'desk', chair: 'office' },
  { id: 'seat.creed', areaId: 'bullpen', x: 36.6, y: 4.2, facing: 'w', kind: 'desk', chair: 'office' },
  { id: 'seat.angela', areaId: 'bullpen', x: 14.2, y: 9, facing: 's', kind: 'desk', chair: 'office' },
  { id: 'seat.oscar', areaId: 'bullpen', x: 18.7, y: 6.4, facing: 'w', kind: 'desk', chair: 'office' },
  { id: 'seat.kevin', areaId: 'bullpen', x: 14.2, y: 4.3, facing: 'n', kind: 'desk', chair: 'office' },
  { id: 'seat.spare.2', areaId: 'bullpen', x: 38.2, y: 9.7, facing: 'n', kind: 'spare', chair: 'office' },
  { id: 'seat.spare.3', areaId: 'bullpen', x: 38.2, y: 14.2, facing: 's', kind: 'spare', chair: 'office' },
  // conference room: chair rows facing the screen, filled from the front-left so meetings read well
  { id: 'seat.conf.s1', areaId: 'conference', x: 28.1, y: 27.6, facing: 'w', kind: 'meeting', chair: 'conference' },
  { id: 'seat.conf.s2', areaId: 'conference', x: 28.1, y: 29.4, facing: 'w', kind: 'meeting', chair: 'conference' },
  { id: 'seat.conf.s3', areaId: 'conference', x: 30.1, y: 27.6, facing: 'w', kind: 'meeting', chair: 'conference' },
  { id: 'seat.conf.s4', areaId: 'conference', x: 30.1, y: 29.4, facing: 'w', kind: 'meeting', chair: 'conference' },
  { id: 'seat.conf.n1', areaId: 'conference', x: 28.1, y: 31.2, facing: 'w', kind: 'meeting', chair: 'conference' },
  { id: 'seat.conf.n2', areaId: 'conference', x: 30.1, y: 31.2, facing: 'w', kind: 'meeting', chair: 'conference' },
  { id: 'seat.conf.n3', areaId: 'conference', x: 32.1, y: 27.6, facing: 'w', kind: 'meeting', chair: 'conference' },
  { id: 'seat.conf.n4', areaId: 'conference', x: 32.1, y: 29.4, facing: 'w', kind: 'meeting', chair: 'conference' },
  { id: 'seat.conf.w1', areaId: 'conference', x: 28.1, y: 33, facing: 'w', kind: 'meeting', chair: 'conference' },
  { id: 'seat.conf.e1', areaId: 'conference', x: 30.1, y: 33, facing: 'w', kind: 'meeting', chair: 'conference' },
  // kitchen + break room
  { id: 'seat.ira', areaId: 'kitchen', x: 50.4, y: 19.2, facing: 's', kind: 'desk', chair: 'conference' },
  { id: 'seat.brk.s1', areaId: 'breakroom', x: 64.4, y: 32.65, facing: 's', kind: 'meeting', chair: 'conference' },
  { id: 'seat.brk.s2', areaId: 'breakroom', x: 67.4, y: 30.5, facing: 's', kind: 'meeting', chair: 'conference' },
  { id: 'seat.brk.w1', areaId: 'breakroom', x: 66, y: 31, facing: 'w', kind: 'meeting', chair: 'conference' },
  { id: 'seat.brk.n1', areaId: 'breakroom', x: 67.4, y: 27.3, facing: 'n', kind: 'meeting', chair: 'conference' },
  // annex
  { id: 'seat.kelly', areaId: 'annex', x: 67.3, y: 19, facing: 's', kind: 'desk', chair: 'office' },
  { id: 'seat.ryan', areaId: 'annex', x: 67.8, y: 5.9, facing: 's', kind: 'desk', chair: 'office' },
  { id: 'seat.toby', areaId: 'annex', x: 69.5, y: 9.3, facing: 's', kind: 'desk', chair: 'office' },
  { id: 'seat.holly', areaId: 'annex', x: 67.2, y: 2.8, facing: 's', kind: 'desk', chair: 'office' },
  // warehouse
  { id: 'seat.darryl', areaId: 'warehouse', x: 14.8, y: 50, facing: 's', kind: 'desk', chair: 'office' },
  { id: 'seat.roy', areaId: 'warehouse', x: 24.5, y: 43.4, facing: 'w', kind: 'desk', chair: 'forklift' },
];
