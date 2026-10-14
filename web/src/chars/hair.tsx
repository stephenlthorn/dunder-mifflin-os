// Hair (and caps) for the front 3/4 view and the back view. Back layers sit behind the head; front layers over it.
import type { HairStyle } from '@shared/contract';
import { shade } from '../iso/color';
import { at } from './geometry';

type P = { style: HairStyle; color: string; cx: number; cy: number };

const SHORT = 'Mx-9.2,y+1 Cx-10,y-7 x-5,y-11.5 x+1,y-11.2 Cx+7,y-11 x+10.2,y-6 x+9.4,y-1.5 Cx+8,y-4.5 x+5,y-5.5 x+1,y-5.2 Cx-2,y-5 x-4,y-3.6 x-5.5,y-2.5 Lx-6.5,y+1.5 Z';
const SIDE = 'Mx-9.3,y+1 Cx-10.5,y-8 x-4,y-12.8 x+2,y-12.2 Cx+8,y-11.6 x+10.8,y-7 x+9.6,y-2 Cx+7,y-6.8 x+3,y-7.6 x-1,y-5.2 Cx-3,y-4 x-5,y-3 x-6.2,y-1.8 Lx-6.6,y+1.6 Z';
const CENTER = 'Mx-9.4,y+2.5 Cx-10.2,y-6 x-6,y-11.5 x+1,y-11.4 Cx+8,y-11.5 x+10.4,y-6 x+9.6,y+0.5 Lx+8.2,y-3 Cx+6,y-6 x+4,y-6.5 x+1.6,y-6.8 Lx+1.2,y-9.6 Lx+0.6,y-6.8 Cx-2,y-6.4 x-5,y-5 x-6.6,y-2 Z';
const PULLED = 'Mx-9.2,y+0.5 Cx-10,y-7.5 x-5,y-11.4 x+1,y-11.2 Cx+7,y-11 x+10,y-6.5 x+9.4,y-2.5 Cx+6,y-6 x+2,y-7.2 x-2.5,y-6 Cx-4.5,y-5 x-5.8,y-3.4 x-6.4,y-1 Z';
const LONG_FRONT = 'Mx-9.5,y+4 Cx-10.5,y-7 x-5,y-11.6 x+1,y-11.4 Cx+7.5,y-11.4 x+10.6,y-6 x+9.8,y+4 Lx+8.4,y+4 Cx+8.2,y-2 x+6.5,y-6.4 x+2,y-7 Cx-2,y-6.8 x-5.4,y-4 x-6.8,y+4 Z';
const BOB_FRONT = 'Mx-9.8,y+6.5 Cx-11,y-7 x-5,y-11.8 x+1,y-11.6 Cx+7.5,y-11.6 x+11,y-7 x+10,y+6.5 Lx+8.2,y+6.5 Cx+8.4,y+1 x+8.2,y-3 x+6.5,y-4.5 Cx+3,y-4.2 x-1,y-4.6 x-4.5,y-5 Cx-6.5,y-3 x-7,y+1 x-7.2,y+6.5 Z';
const BUZZ = 'Mx-8.9,y-1 Cx-9,y-8 x-4.5,y-9.6 x+0.5,y-9.6 Cx+6,y-9.6 x+9.2,y-6.5 x+8.9,y-1.5 Cx+6,y-5.2 x-3,y-5.4 x-6.4,y-3.2 Z';
const WILD = 'Mx-9.4,y+2.5 Lx-11.2,y-0.5 Lx-10.2,y-3.6 Lx-11.8,y-6.4 Lx-8.6,y-8.6 Lx-8.8,y-11.4 Lx-4.6,y-11.2 Lx-2.6,y-13 Lx+1.2,y-11.6 Lx+4.4,y-12.6 Lx+6,y-10.4 Lx+9.6,y-10.2 Lx+9.2,y-7 Lx+11.2,y-4.6 Lx+9.6,y-2.2 Lx+8.6,y-4.4 Cx+5,y-6.8 x-1,y-6.6 x-5.2,y-4.2 Lx-6.6,y+2 Z';
const BALD_SIDES = 'Mx-9.3,y+1.5 Cx-9.8,y-3 x-8.6,y-6 x-6.5,y-7.5 Lx-5,y-5 Cx-6.2,y-3 x-6.4,y-0.5 x-6.2,y+1.8 Z Mx+8.4,y-5 Cx+9.6,y-3 x+9.8,y-1 x+9.4,y+0.5 Lx+8.2,y-1.5 Z';
const CURLS: [number, number][] = [[-9.4, 1], [-9.8, 4.6], [-9.6, -3.5], [-7.8, -7.5], [-4.2, -10.4], [0.4, -11.4], [5, -10.6], [8.4, -7.6], [9.8, -3.4], [10, 1], [9.6, 4.6]];

const BACK_CAP = 'Mx-9.2,y+3 Cx-10,y-8 x-5,y-11.5 x,y-11.4 Cx+5,y-11.5 x+10,y-8 x+9.2,y+3 Cx+5,y+5 x-5,y+5 x-9.2,y+3 Z';
const BACK_BOB = 'Mx-10,y+7 Cx-10.6,y-8 x-5,y-11.8 x,y-11.6 Cx+5,y-11.8 x+10.6,y-8 x+10,y+7 Z';
const BACK_BALD = 'Mx-9.4,y-1 Cx-6,y+0.5 x+6,y+0.5 x+9.4,y-1 Lx+9.2,y+3 Cx+5,y+5 x-5,y+5 x-9.2,y+3 Z';

const Shine = ({ cx, cy }: { cx: number; cy: number }) => <ellipse cx={cx + 2} cy={cy - 6} rx={3} ry={1.6} fill="#ffffff" opacity={0.42} />;

/** Hair drawn before the head in the front view (ponytails, long hair, buns, bob volume). */
export function FrontHairBack({ style, color, cx, cy }: P) {
  const dark = shade(color, -0.12);
  switch (style) {
    case 'ponytail':
      return <path d={at(cx, cy, 'Mx-5,y-9 Cx-12,y-8 x-13,y+2 x-10.5,y+10 Cx-9,y+6 x-8,y+1 x-6,y-2 Z')} fill={dark} />;
    case 'bun':
      return <circle cx={cx - 3.5} cy={cy - 11} r={4.2} fill={dark} />;
    case 'long':
      return <path d={at(cx, cy, 'Mx-10,y-4 Cx-11.5,y+6 x-11,y+13 x-9,y+16 Lx+10,y+16 Cx+11.5,y+10 x+11,y+3 x+10,y-4 Z')} fill={dark} />;
    case 'bob':
      return <path d={at(cx, cy, 'Mx-10.4,y-3 Lx-10.4,y+6.5 Lx+10.6,y+6.5 Lx+10.6,y-3 Z')} fill={dark} />;
    default:
      return null;
  }
}

export function FrontHair({ style, color, cx, cy }: P) {
  const line = shade(color, -0.3);
  switch (style) {
    case 'short':
      return <path d={at(cx, cy, SHORT)} fill={color} />;
    case 'side-part':
      return (
        <>
          <path d={at(cx, cy, SIDE)} fill={color} />
          <path d={at(cx, cy, 'Mx-3,y-11.6 Qx-2,y-8.5 x-0.5,y-6')} stroke={line} strokeWidth={0.7} fill="none" />
        </>
      );
    case 'center-part':
      return <path d={at(cx, cy, CENTER)} fill={color} />;
    case 'bun':
    case 'ponytail':
      return (
        <>
          <path d={at(cx, cy, PULLED)} fill={color} />
          {style === 'ponytail' && <ellipse cx={cx - 7.6} cy={cy - 6.4} rx={1.2} ry={1.6} fill={line} />}
        </>
      );
    case 'long':
      return <path d={at(cx, cy, LONG_FRONT)} fill={color} />;
    case 'bob':
      return <path d={at(cx, cy, BOB_FRONT)} fill={color} />;
    case 'buzz':
      return <path d={at(cx, cy, BUZZ)} fill={color} opacity={0.9} />;
    case 'grey-wild':
      return <path d={at(cx, cy, WILD)} fill={color} stroke={shade(color, -0.25)} strokeWidth={0.5} strokeLinejoin="round" />;
    case 'curly':
      return (
        <>
          <path d={at(cx, cy, BOB_FRONT)} fill={color} />
          {CURLS.map(([dx, dy], i) => <circle key={i} cx={cx + dx} cy={cy + dy} r={2.7} fill={i % 3 === 0 ? shade(color, -0.1) : color} />)}
        </>
      );
    case 'balding':
      return (
        <>
          <path d={at(cx, cy, BALD_SIDES)} fill={color} />
          <Shine cx={cx} cy={cy} />
        </>
      );
    default:
      return <Shine cx={cx} cy={cy} />;
  }
}

export function BackHair({ style, color, cx, cy }: P) {
  const dark = shade(color, -0.12);
  switch (style) {
    case 'bald':
      return <Shine cx={cx - 3} cy={cy} />;
    case 'balding':
      return (
        <>
          <path d={at(cx, cy, BACK_BALD)} fill={color} />
          <Shine cx={cx - 3} cy={cy} />
        </>
      );
    case 'bob':
      return <path d={at(cx, cy, BACK_BOB)} fill={color} />;
    case 'long':
      return (
        <>
          <path d={at(cx, cy, 'Mx-10,y-2 Lx-10.4,y+17 Lx+10.4,y+17 Lx+10,y-2 Z')} fill={dark} />
          <path d={at(cx, cy, BACK_CAP)} fill={color} />
        </>
      );
    case 'ponytail':
      return (
        <>
          <path d={at(cx, cy, BACK_CAP)} fill={color} />
          <path d={at(cx, cy, 'Mx-2,y-3 Cx-3,y+4 x-2,y+9 x+0.5,y+12 Cx+2.5,y+8 x+3,y+3 x+2,y-3 Z')} fill={dark} />
          <ellipse cx={cx} cy={cy - 3} rx={2.2} ry={1.1} fill={shade(color, -0.35)} />
        </>
      );
    case 'bun':
      return (
        <>
          <path d={at(cx, cy, BACK_CAP)} fill={color} />
          <circle cx={cx} cy={cy - 7.5} r={4.2} fill={dark} />
        </>
      );
    case 'grey-wild':
      return <path d={at(cx, cy, WILD)} fill={color} stroke={shade(color, -0.25)} strokeWidth={0.5} />;
    case 'curly':
      return (
        <>
          <path d={at(cx, cy, BACK_BOB)} fill={color} />
          {CURLS.map(([dx, dy], i) => <circle key={i} cx={cx + dx} cy={cy + dy} r={2.7} fill={i % 3 === 0 ? dark : color} />)}
        </>
      );
    case 'buzz':
      return <path d={at(cx, cy, BACK_CAP)} fill={color} opacity={0.85} />;
    default:
      return <path d={at(cx, cy, BACK_CAP)} fill={color} />;
  }
}

/** A baseball cap (Roy). Front view shows the brim toward the facing side. */
export function Cap({ color, cx, cy, back }: { color: string; cx: number; cy: number; back?: boolean }) {
  const brim = shade(color, -0.25);
  return (
    <>
      <path d={at(cx, cy, 'Mx-9.4,y-1.5 Cx-9.6,y-9 x-4,y-12.2 x+1,y-12.2 Cx+7,y-12.2 x+10,y-8 x+9.6,y-2.5 Z')} fill={color} />
      {back
        ? <path d={at(cx, cy, 'Mx-3,y-2.6 Lx+3,y-2.6 Lx+2,y-4.6 Lx-2,y-4.6 Z')} fill={brim} />
        : <path d={at(cx, cy, 'Mx+3,y-3.4 Cx+8,y-4.5 x+13,y-3.6 x+14.5,y-1.8 Cx+11,y-1 x+6,y-1.6 x+3,y-1.8 Z')} fill={brim} />}
      <circle cx={cx + 1} cy={cy - 12} r={0.9} fill={brim} />
    </>
  );
}
