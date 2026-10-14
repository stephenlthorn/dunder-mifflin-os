import type { Wall } from '../office';

// 'door' = open doorway; 'wood-door' = closed door leaf; 'window' = sill + glass; 'window-blinds' = sill + blinds;
// 'glass' = full-height glazing; 'blinds' = glazing with blinds. x-walls own corners, so never split an x-wall where a
// y-wall ends on it (y-walls may be split at x-walls).
const PINK = '#efc9cf';
const BLUE = '#bcd4e2';
const FULL = 4.4; // the far exterior walls (back, right end) stand full height, like the render; the rest are cut away
const STAIR = 3.6; // the stair room's front wall stands above the cut to carry the kitchen's wall cabinets
const LOW = 1.6; // the front walls, cut low like the original's

export const WALLS: readonly Wall[] = [
  // exterior shell: the back wall runs from the hallway's exit door to the break room
  { id: 'ext.back', axis: 'x', at: 35, from: -7, to: 72, exterior: true, height: FULL, openings: [
    { from: -6.2, to: -4.4, kind: 'wood-door' },
    { from: 14.4, to: 16.4, kind: 'window-blinds' }, { from: 17.6, to: 19.6, kind: 'window-blinds' },
    { from: 26.4, to: 28.6, kind: 'window-blinds' }, { from: 29.6, to: 31.8, kind: 'window-blinds' },
    { from: 58.6, to: 61.6, kind: 'window-blinds' },
  ] },
  // the hallway's end wall: the stair door between wired-glass panels
  { id: 'ext.lobby-end', axis: 'y', at: -7, from: 22.5, to: 35, exterior: true, openings: [
    { from: 27.2, to: 28.6, kind: 'glass' }, { from: 28.6, to: 30.6, kind: 'wood-door', color: '#7d93a6' }, { from: 30.6, to: 32, kind: 'glass' },
  ] },
  // jutting out of the hallway's front wall: the plant bay at the far left and the elevator alcove
  { id: 'lobby.bay-front', axis: 'x', at: 22.5, from: -7, to: -3, exterior: true },
  { id: 'lobby.bay-side', axis: 'y', at: -3, from: 22.5, to: 26, exterior: true },
  { id: 'lobby.lift-front', axis: 'x', at: 19.5, from: 1, to: 7, exterior: true },
  { id: 'lobby.lift-left', axis: 'y', at: 1, from: 19.5, to: 26, exterior: true },
  { id: 'lobby.lift-right', axis: 'y', at: 7, from: 19.5, to: 26, exterior: true },
  { id: 'ext.left', axis: 'y', at: 10, from: 0, to: 26, exterior: true, openings: [{ from: 1.6, to: 6.4, kind: 'window-blinds' }] },
  // the front walls, cut low like the original's so the front of the rooms reads: the accounting corner (with a jog
  // sticking out), a step back to the recessed middle stretch, which runs on past the restroom block (its stall doors),
  // the two toilet stalls jutting out of it (men's, women's), then the annex's front
  { id: 'ext.front', axis: 'x', at: 0, from: 10, to: 22, exterior: true, height: LOW, openings: [
    { from: 12, to: 15.6, kind: 'window-blinds' }, { from: 19.4, to: 21.2, kind: 'wood-door' },
  ] },
  { id: 'ext.jog', axis: 'y', at: 18.6, from: -2.2, to: 0, exterior: true, height: LOW },
  { id: 'ext.step', axis: 'y', at: 22, from: 0, to: 2, exterior: true, height: LOW },
  { id: 'ext.front-mid', axis: 'x', at: 2, from: 22, to: 52, exterior: true, height: LOW, openings: [
    { from: 25.4, to: 29, kind: 'window-blinds' }, { from: 31, to: 34.6, kind: 'window-blinds' }, { from: 36.4, to: 39.6, kind: 'window-blinds' },
    { from: 44.2, to: 45.8, kind: 'wood-door', color: '#3d7ea6' }, { from: 48.8, to: 50.4, kind: 'wood-door', color: '#d98fa0' },
  ] },
  { id: 'wc.m.stall-left', axis: 'y', at: 43, from: -2, to: 2, exterior: true, height: LOW },
  { id: 'wc.m.stall-front', axis: 'x', at: -2, from: 43, to: 47, exterior: true, height: LOW },
  { id: 'wc.m.stall-right', axis: 'y', at: 47, from: -2, to: 2, exterior: true, height: LOW },
  { id: 'wc.w.stall-left', axis: 'y', at: 47.6, from: -2, to: 2, exterior: true, height: LOW, color: PINK },
  { id: 'wc.w.stall-front', axis: 'x', at: -2, from: 47.6, to: 51.6, exterior: true, height: LOW, color: PINK },
  { id: 'wc.w.stall-right', axis: 'y', at: 51.6, from: -2, to: 2, exterior: true, height: LOW, color: PINK },
  { id: 'ext.annex-jog', axis: 'y', at: 52, from: 0, to: 2, exterior: true, height: LOW },
  { id: 'ext.annex-front', axis: 'x', at: 0, from: 52, to: 72, exterior: true, height: LOW, openings: [
    { from: 56.4, to: 59.6, kind: 'window-blinds' }, { from: 62, to: 65.2, kind: 'window-blinds' },
  ] },
  { id: 'ext.right', axis: 'y', at: 72, from: 0, to: 35, exterior: true, height: FULL, openings: [
    { from: 2.4, to: 6.6, kind: 'window-blinds' }, { from: 28.4, to: 32, kind: 'window-blinds' },
  ] },
  // the back row's front wall: the hallway (open to its bay and the elevator), reception doors, Michael's office,
  // conference room, and the opening into the corridor that leads to the stair door
  { id: 'backrow.front', axis: 'x', at: 26, from: -7, to: 44, openings: [
    { from: -6.85, to: -3.15, kind: 'door' }, { from: 1.2, to: 6.8, kind: 'door' },
    { from: 10.3, to: 10.9, kind: 'glass' }, { from: 10.9, to: 12.3, kind: 'door' }, { from: 12.3, to: 12.85, kind: 'glass' },
    { from: 13.4, to: 18.4, kind: 'blinds' }, { from: 19, to: 20.6, kind: 'wood-door' }, { from: 21, to: 24.1, kind: 'blinds' },
    { from: 25, to: 26.6, kind: 'wood-door' }, { from: 27.1, to: 40.1, kind: 'glass' },
    { from: 40.9, to: 43.6, kind: 'door' },
  ] },
  { id: 'lobby|michael', axis: 'y', at: 13, from: 26, to: 35 },
  { id: 'michael|conference', axis: 'y', at: 24.5, from: 26, to: 35 },
  { id: 'conference|stairwell', axis: 'y', at: 40.5, from: 26, to: 35 },
  // the stair room: a walled box behind the kitchen whose side walls stand full height like the original's, with the
  // stair door at the back of the corridor; its front wall carries the kitchen's cabinets, so it stands above the cut.
  { id: 'corridor|stairs', axis: 'y', at: 44, from: 22.5, to: 35, height: FULL, openings: [{ from: 32, to: 33.8, kind: 'wood-door' }] },
  { id: 'stairs.front', axis: 'x', at: 22.5, from: 40.5, to: 54, height: STAIR },
  { id: 'stairs|nook', axis: 'y', at: 54, from: 22.5, to: 35, height: FULL },
  // the bullpen's east wall, as in the original: the restroom block's left side (men's room door), then the kitchen's
  // (a blinds window, a wood door and a doorway)
  { id: 'bullpen|east', axis: 'y', at: 40.5, from: 2, to: 22.5, openings: [
    { from: 3.6, to: 5.2, kind: 'wood-door', color: '#3d7ea6' },
    { from: 10.4, to: 12.8, kind: 'window-blinds' }, { from: 13.2, to: 14.8, kind: 'wood-door' }, { from: 15.4, to: 17.4, kind: 'door' },
  ] },
  { id: 'wc.divider', axis: 'y', at: 47.3, from: 2, to: 9, color: BLUE },
  { id: 'restrooms|kitchen', axis: 'x', at: 9, from: 40.5, to: 54, openings: [{ from: 47.6, to: 49.2, kind: 'wood-door', color: '#d98fa0' }] },
  { id: 'wc.women-side', axis: 'y', at: 52, from: 2, to: 9, color: PINK },
  { id: 'kitchen|east', axis: 'y', at: 54, from: 9, to: 22.5, openings: [
    { from: 10.4, to: 12, kind: 'wood-door' }, { from: 12.2, to: 13.8, kind: 'wood-door' }, { from: 18.4, to: 21.8, kind: 'window-blinds' },
  ] },
  // the break room, entered from the annex's waiting nook through a door in its left wall, as in the original
  { id: 'nook|breakroom', axis: 'y', at: 62, from: 26, to: 35, openings: [{ from: 27.4, to: 29.2, kind: 'wood-door' }] },
  { id: 'annex|breakroom', axis: 'x', at: 26, from: 62, to: 72, openings: [
    { from: 62.6, to: 64.2, kind: 'wood-door' }, { from: 64.8, to: 70.8, kind: 'window' },
  ] },
  // warehouse (downstairs inset, behind the left half of the building)
  { id: 'wh.front', axis: 'x', at: 41, from: 12, to: 32, exterior: true, openings: [{ from: 18, to: 21.4, kind: 'door' }] },
  { id: 'wh.left', axis: 'y', at: 12, from: 41, to: 51, exterior: true },
  { id: 'wh.back', axis: 'x', at: 51, from: 12, to: 32, exterior: true },
  { id: 'wh.right', axis: 'y', at: 32, from: 41, to: 51, exterior: true },
  { id: 'wh.office-front', axis: 'x', at: 46.5, from: 12, to: 17.5, openings: [
    { from: 12.4, to: 14.6, kind: 'glass' }, { from: 15, to: 16.6, kind: 'wood-door' },
  ] },
  { id: 'wh.office-side', axis: 'y', at: 17.5, from: 46.5, to: 51, openings: [{ from: 46.9, to: 50.6, kind: 'glass' }] },
];
