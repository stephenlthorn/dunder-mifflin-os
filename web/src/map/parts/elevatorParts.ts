// The elevator: an open (cut-away) brushed-steel car at the back of a thick-walled beige shaft in the hallway's
// alcove, like the render: steel floor plate, walls with streaks, handrails, a call panel, and closed doors between
// steel jambs on the hallway side (+y).
import type { Furniture } from '@shared/office';
import type { Box3, Vec3 } from '../../iso/projection';
import { PAL } from '../palette';
import { type Decal, type Part, box, faceRect } from './parts';

const STEEL = '#aeb4bb';
const STEEL_TOP = '#dde1e5';
const DARK = '#8b9199';
const T = 0.14; // car wall thickness
const SHAFT_SIDE = 0.55; // the shaft's beige walls around the car
const SHAFT_FRONT = 1.2;
const SHAFT_H = 2.5;
const DOOR_D = 0.3;
const JAMB = 0.45;

/** Light and dark vertical streaks across a face: plane x = at (axis 'x') or y = at (axis 'y'), u0..u1 along it. */
function brushed(axis: 'x' | 'y', at: number, u0: number, u1: number, z0: number, z1: number): Decal[] {
  const n = Math.max(3, Math.round((u1 - u0) / 0.5));
  const step = (u1 - u0) / n;
  const pt = (u: number, z: number): Vec3 => (axis === 'x' ? { x: at, y: u, z } : { x: u, y: at, z });
  const streaks = Array.from({ length: n }, (_, i) => faceRect(axis, at, u0 + i * step + step * 0.15, u0 + i * step + step * 0.45, z0, z1, '#ffffff', i % 2 ? 0.1 : 0.22));
  const lines: Decal = {
    kind: 'lines', stroke: DARK, width: 0.35, opacity: 0.5,
    segments: Array.from({ length: n - 1 }, (_, i): [Vec3, Vec3] => [pt(u0 + (i + 1) * step, z0), pt(u0 + (i + 1) * step, z1)]),
  };
  return [...streaks, lines];
}

/** The beige shaft walls (cut like the office walls) around the car: left, right and the thick front. */
function shaftParts(f: Furniture): Part[] {
  const wall = (id: string, b: Box3) => box(`${f.id}.${id}`, b, PAL.wall, PAL.wallCut, { stroke: 'rgba(90,75,55,0.25)' });
  return [
    wall('shaft-left', { x: f.x, y: f.y, z: 0, w: SHAFT_SIDE, d: f.d, h: SHAFT_H }),
    wall('shaft-right', { x: f.x + f.w - SHAFT_SIDE, y: f.y, z: 0, w: SHAFT_SIDE, d: f.d, h: SHAFT_H }),
    wall('shaft-front', { x: f.x + SHAFT_SIDE, y: f.y, z: 0, w: f.w - 2 * SHAFT_SIDE, d: SHAFT_FRONT, h: SHAFT_H }),
  ];
}

export function elevatorParts(f: Furniture): Part[] {
  const car: Furniture = { ...f, x: f.x + SHAFT_SIDE, y: f.y + SHAFT_FRONT, w: f.w - 2 * SHAFT_SIDE, d: f.d - SHAFT_FRONT };
  return [...shaftParts(f), ...carParts(car)];
}

function carParts(f: Furniture): Part[] {
  const h = f.h ?? 2.7;
  const x1 = f.x + f.w;
  const doorY = f.y + f.d - DOOR_D;
  const innerY = f.y + T;
  const floor: Box3 = { x: f.x + T, y: innerY, z: 0, w: f.w - 2 * T, d: doorY - innerY, h: 0.06 };
  const plate = Array.from({ length: Math.floor(floor.d / 0.35) }, (_, i): [Vec3, Vec3] => [
    { x: floor.x + 0.1, y: floor.y + (i + 1) * 0.35, z: 0.06 }, { x: floor.x + floor.w - 0.1, y: floor.y + (i + 1) * 0.35, z: 0.06 },
  ]);
  const railZ = 1.75;
  const railEnd = doorY - 1.15; // stops short of the call panel
  const doors: Box3 = { x: f.x + JAMB, y: doorY, z: 0, w: f.w - 2 * JAMB, d: DOOR_D, h: h - 0.35 };
  const mid = doors.x + doors.w / 2;
  return [
    box(`${f.id}.floor`, floor, '#8f959c', '#b7bcc2', { decals: [{ kind: 'lines', segments: plate, stroke: '#9ba1a8', width: 0.5 }] }),
    box(`${f.id}.wall-left`, { x: f.x, y: f.y, z: 0, w: T, d: doorY - f.y, h }, STEEL, STEEL_TOP, {
      decals: brushed('x', f.x + T, f.y + T, doorY, 0.08, h - 0.05),
    }),
    box(`${f.id}.wall-right`, { x: x1 - T, y: f.y, z: 0, w: T, d: doorY - f.y, h }, STEEL, STEEL_TOP, {
      decals: brushed('x', x1 - T, f.y + T, doorY, 0.08, h - 0.05),
    }),
    box(`${f.id}.wall-front`, { x: f.x + T, y: f.y, z: 0, w: f.w - 2 * T, d: T, h }, STEEL, STEEL_TOP),
    box(`${f.id}.rail-left`, { x: f.x + T, y: innerY + 0.4, z: railZ, w: 0.1, d: railEnd - innerY - 0.4, h: 0.1 }, '#e6e9ec', '#f6f7f8'),
    box(`${f.id}.rail-right`, { x: x1 - T - 0.1, y: innerY + 0.4, z: railZ, w: 0.1, d: railEnd - innerY - 0.4, h: 0.1 }, '#e6e9ec', '#f6f7f8'),
    box(`${f.id}.rail-front`, { x: f.x + T + 0.4, y: innerY, z: railZ, w: f.w - 2 * T - 0.8, d: 0.1, h: 0.1 }, '#e6e9ec', '#f6f7f8'),
    box(`${f.id}.panel`, { x: f.x + T, y: doorY - 0.95, z: 1.15, w: 0.05, d: 0.5, h: 0.85 }, '#5d636b', '#7d838b', {
      decals: [0.3, 0.45, 0.6].map((z) => faceRect('x', f.x + T + 0.05, doorY - 0.8, doorY - 0.62, 1.15 + z, 1.15 + z + 0.09, '#f2c230')),
    }),
    box(`${f.id}.jamb-left`, { x: f.x, y: doorY, z: 0, w: JAMB, d: DOOR_D, h }, DARK, '#b9bec4'),
    box(`${f.id}.jamb-right`, { x: x1 - JAMB, y: doorY, z: 0, w: JAMB, d: DOOR_D, h }, DARK, '#b9bec4'),
    box(`${f.id}.header`, { x: f.x + JAMB, y: doorY, z: h - 0.35, w: f.w - 2 * JAMB, d: DOOR_D, h: 0.35 }, DARK, '#b9bec4', {
      decals: [faceRect('y', doorY, mid - 0.25, mid + 0.25, h - 0.27, h - 0.08, '#2b2f36'), faceRect('y', doorY, mid - 0.12, mid + 0.12, h - 0.23, h - 0.12, '#f2a33a')],
    }),
    box(`${f.id}.doors`, doors, '#c3c8ce', '#d9dde1', {
      decals: [
        ...brushed('y', doorY, doors.x, doors.x + doors.w, 0.05, doors.h - 0.05),
        { kind: 'lines', segments: [[{ x: mid, y: doorY, z: 0 }, { x: mid, y: doorY, z: doors.h }]], stroke: '#5d636b', width: 0.9 },
      ],
    }),
  ];
}
