// Torso, clothing layers and arms for the seated chibi, front (3/4 toward the camera) and back views.
import type { Look } from '@shared/contract';
import { shade } from '../iso/color';
import { TROUSERS, torsoHalfWidth, torsoPath } from './geometry';

type Props = { look: Look; vest?: string; standing?: boolean };

const outerOf = (look: Look, vest?: string) => look.jacket ?? look.cardigan ?? vest;

/** Straight legs to the floor, for a figure standing at the coffee maker or the water cooler (hips at y 0). */
function StandingLegs({ w, back = false }: { w: number; back?: boolean }) {
  const shoe = '#1f1b18';
  return (
    <g className="legs">
      <path d={`M${-w + 0.6} -0.5L-0.3 -0.5L-0.6 12.6L${-w + 1.2} 12.6Z`} fill={back ? shade(TROUSERS, -0.06) : TROUSERS} />
      <path d={`M0.5 -0.5L${w - 0.4} -0.5L${w - 1} 12.6L0.8 12.6Z`} fill={shade(TROUSERS, -0.12)} />
      <ellipse cx={(-w + 0.6) / 2 - 0.2} cy={13.1} rx={2.4} ry={1.1} fill={shoe} />
      <ellipse cx={(w + 0.4) / 2} cy={13.1} rx={2.4} ry={1.1} fill={shoe} />
    </g>
  );
}

/** A belt round the waist with a knot and two tails (Sensei Ira's black belt). */
function FrontBelt({ color, w }: { color: string; w: number }) {
  return (
    <g className="belt">
      <path d={`M${-w - 0.3} -3.8L${w + 0.4} -3.8L${w + 0.3} -1.9L${-w - 0.2} -1.9Z`} fill={color} />
      <path d="M1.4 -2.3L0.3 1.4L1.5 1.7L2.3 -2.1ZM2.5 -2.2L3.6 1.2L4.7 0.9L3.3 -2.3Z" fill={shade(color, 0.12)} />
      <rect x={1.1} y={-4.2} width={2.6} height={2.6} rx={0.6} fill={shade(color, 0.2)} />
    </g>
  );
}

export function FrontBody({ look, vest, standing = false }: Props) {
  const w = torsoHalfWidth(look.build);
  const outer = outerOf(look, vest);
  const sleeve = look.jacket ?? look.cardigan ?? look.shirt;
  const deepV = Boolean(look.jacket);
  const collar = Boolean(look.tie || look.jacket);
  const skin = look.skin;
  return (
    <g>
      {standing ? <StandingLegs w={w} /> : (
        <>
          {/* thighs + shins (mostly hidden behind the desk) */}
          <path d={`M${-w + 0.5} 0L${w - 0.5} 0L${w + 3.5} 5.5L1.5 6.5Z`} fill={TROUSERS} />
          <path d={`M2 5.5L${w + 3.5} 5.5L${w + 3} 14L4 14Z`} fill={shade(TROUSERS, -0.1)} />
          <ellipse cx={w + 2.6} cy={14.6} rx={3.2} ry={1.4} fill="#1f1b18" />
        </>
      )}
      {/* torso */}
      <path d={torsoPath(w)} fill={outer ?? look.shirt} />
      {outer && <path d={`M-1.6 -13.8L3.4 -13.8L${deepV ? 1.2 : 1} ${deepV ? -4.5 : -6.5}Z`} fill={look.shirt} />}
      {outer && deepV && (
        <path d={`M-1.6 -13.8L1.2 -4.5M3.4 -13.8L1.2 -4.5`} stroke={shade(outer, -0.3)} strokeWidth={0.8} fill="none" />
      )}
      {outer && !deepV && !vest && <><circle cx={1} cy={-5} r={0.55} fill={shade(outer, -0.35)} /><circle cx={1} cy={-2.4} r={0.55} fill={shade(outer, -0.35)} /></>}
      {vest && !look.jacket && !look.cardigan && <path d="M-1.6 -13.8L-0.6 -1M3.4 -13.8L2.6 -1" stroke={shade(vest, -0.2)} strokeWidth={0.6} />}
      {collar && <path d="M-1.8 -14.2L0.9 -14L0.2 -11.6ZM1.3 -14L4 -14.2L2.2 -11.6Z" fill="#fbfbf8" />}
      {look.tie && <path d="M0.4 -13.6L2.2 -13.6L1.9 -12.2L2.4 -5L1.3 -3.6L0.3 -5L0.7 -12.2Z" fill={look.tie} />}
      {look.belt && <FrontBelt color={look.belt} w={w} />}
      {/* arms reaching to the desk */}
      <path d={`M${-w - 0.4} -12L${-w - 0.2} -5L-0.8 -3.2`} stroke={sleeve} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d={`M${w + 0.4} -12L${w + 1.8} -5L${w + 4.4} -3.6`} stroke={shade(sleeve, -0.06)} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx={-0.6} cy={-3.2} r={1.7} fill={skin} />
      <circle cx={w + 4.6} cy={-3.6} r={1.7} fill={skin} />
      {/* neck */}
      <path d="M-0.9 -16.5L2.9 -16.5L2.7 -13.6L-0.7 -13.6Z" fill={shade(skin, -0.1)} />
    </g>
  );
}

export function BackBody({ look, vest, standing = false }: Props) {
  const w = torsoHalfWidth(look.build);
  const outer = outerOf(look, vest);
  const back = outer ?? look.shirt;
  const sleeve = look.jacket ?? look.cardigan ?? look.shirt;
  return (
    <g>
      {standing && <StandingLegs w={w} back />}
      <path d={`M${-w - 0.2} -11.5L${-w - 2.2} -4`} stroke={sleeve} strokeWidth={3.6} strokeLinecap="round" />
      <path d={`M${w + 0.2} -11.5L${w + 1} -4.5`} stroke={shade(sleeve, -0.08)} strokeWidth={3.6} strokeLinecap="round" />
      <path d={torsoPath(w)} fill={back} />
      {look.jacket && <path d="M0 -3L0 0" stroke={shade(back, -0.3)} strokeWidth={0.7} />}
      {vest && <path d={`M${-w + 1} -7H${w - 1}M${-w + 1} -5H${w - 1}`} stroke="#e8eef2" strokeWidth={0.9} opacity={0.85} />}
      {look.belt && <path className="belt" d={`M${-w - 0.3} -3.7L${w + 0.3} -3.7L${w + 0.2} -1.9L${-w - 0.2} -1.9Z`} fill={look.belt} />}
      <path d="M-2.2 -16.5L1.8 -16.5L1.6 -13.6L-2 -13.6Z" fill={shade(look.skin, -0.12)} />
      {(look.tie || look.jacket) && <path d="M-2.6 -14.2L2.4 -14.2L1.8 -13.2L-2 -13.2Z" fill="#fbfbf8" />}
    </g>
  );
}
