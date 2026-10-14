import type { Area } from '../office';

// After the Drawbotics render (Reddit 5rnxeg): a long building. Back wall, left to right: the long elevator hallway
// (sticking out at the back-left, with the elevator alcove and a plant bay jutting out of its front wall), Michael's
// office, conference room, the stairwell (a corridor beside the conference room, then the walled stair room), a waiting
// nook that opens onto the annex, the break room. The kitchen sits in front of the stair room, between the bullpen and the
// annex, with a bay down to the restrooms. The bullpen fills the deep middle with reception just inside the entrance
// (reception overlaps the open-plan bullpen); its front wall steps back past the accounting corner (the corner is a bay);
// the restrooms jut out of the front; the annex is the right end.
// Floor draw order follows this list, so reception comes after the bullpen.
export const AREAS: readonly Area[] = [
  { id: 'lobby', name: 'Elevator Lobby', rect: { x: -7, y: 26, w: 20, h: 9 }, floor: 'carpet', level: 'main', sign: { x: -2.6, y: 29.4 },
    bays: [{ x: -7, y: 22.5, w: 4, h: 3.5 }, { x: 1, y: 19.5, w: 6, h: 6.5 }] },
  { id: 'bullpen', name: 'Bullpen', rect: { x: 10, y: 2, w: 30.5, h: 24 }, floor: 'carpet', level: 'main', sign: { x: 35.6, y: 11.4 },
    bays: [{ x: 10, y: 0, w: 12, h: 2 }, { x: 40.5, y: 22.5, w: 3.5, h: 3.5 }] },
  { id: 'reception', name: 'Reception', rect: { x: 10, y: 11, w: 12, h: 15 }, floor: 'carpet', level: 'main', sign: { x: 11.4, y: 24.2 } },
  { id: 'michael', name: "Michael's Office", rect: { x: 13, y: 26, w: 11.5, h: 9 }, floor: 'carpet', level: 'main', sign: { x: 20.6, y: 30.8 } },
  { id: 'conference', name: 'Conference Room', rect: { x: 24.5, y: 26, w: 16, h: 9 }, floor: 'carpet', level: 'main', sign: { x: 37.6, y: 32.4 } },
  { id: 'stairwell', name: 'Stairwell', rect: { x: 44, y: 22.5, w: 10, h: 12.5 }, floor: 'carpet', level: 'main', sign: { x: 50.2, y: 33.4 },
    bays: [{ x: 40.5, y: 26, w: 3.5, h: 9 }] },
  { id: 'kitchen', name: 'Kitchen', rect: { x: 40.5, y: 15, w: 13.5, h: 7.5 }, floor: 'tile', level: 'main', sign: { x: 45.2, y: 16.8 },
    bays: [{ x: 40.5, y: 9, w: 13.5, h: 6 }] },
  { id: 'restrooms', name: 'Restrooms', rect: { x: 40.5, y: 2, w: 11.5, h: 7 }, floor: 'tile', level: 'main', sign: { x: 46, y: 4.4 },
    bays: [{ x: 43, y: -2, w: 4, h: 4 }, { x: 47.6, y: -2, w: 4, h: 4 }] },
  { id: 'breakroom', name: 'Break Room', rect: { x: 62, y: 26, w: 10, h: 9 }, floor: 'slate', level: 'main', sign: { x: 69, y: 28.2 } },
  { id: 'annex', name: 'The Annex', rect: { x: 54, y: 0, w: 18, h: 26 }, floor: 'carpet', level: 'main', sign: { x: 57.6, y: 17.6 },
    bays: [{ x: 54, y: 26, w: 8, h: 9 }, { x: 52, y: 0, w: 2, h: 9 }] },
  { id: 'warehouse', name: 'Warehouse (downstairs)', rect: { x: 12, y: 41, w: 20, h: 10 }, floor: 'concrete', level: 'warehouse', sign: { x: 19.6, y: 42 } },
];
