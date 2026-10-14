// A seated chibi mini character. Front = 3/4 toward the camera (facing s or w); back = facing n or e.
import { memo } from 'react';
import type { Look } from '@shared/contract';
import type { Facing, LookExtras } from '@shared/office';
import { shade } from '../iso/color';
import { BackBody, FrontBody } from './Body';
import { Face } from './Face';
import { BACK_HEAD, FRONT_HEAD, HEAD_R } from './geometry';
import { BackHair, Cap, FrontHair, FrontHairBack } from './hair';
import { RobotBack, RobotFront } from './Robot';

export type CharacterProps = { look: Look; extras?: LookExtras; facing: Facing; standing?: boolean };

export const isFrontFacing = (f: Facing) => f === 's' || f === 'w';
/** Mirror the drawing for the facings that point screen-left (w: down-left, n: up-left uses the base back view). */
const mirrored = (f: Facing) => f === 'w' || f === 'e';

type PoseProps = { look: Look; extras?: LookExtras; standing: boolean };

function Front({ look, extras, standing }: PoseProps) {
  const { x: cx, y: cy } = FRONT_HEAD;
  if (look.robot) return <RobotFront look={look} />;
  return (
    <g>
      <FrontHairBack style={look.hairStyle} color={look.hair} cx={cx} cy={cy} />
      <FrontBody look={look} vest={extras?.vest} standing={standing} />
      <g className="head">
        <ellipse cx={cx - 8} cy={cy + 1} rx={1.7} ry={2.3} fill={shade(look.skin, -0.06)} />
        <circle cx={cx} cy={cy} r={HEAD_R} fill={look.skin} />
        <Face look={look} cx={cx + 2} cy={cy} />
        <FrontHair style={look.hairStyle} color={look.hair} cx={cx} cy={cy} />
        {extras?.cap && <Cap color={extras.cap} cx={cx} cy={cy} />}
      </g>
    </g>
  );
}

function Back({ look, extras, standing }: PoseProps) {
  const { x: cx, y: cy } = BACK_HEAD;
  if (look.robot) return <RobotBack look={look} />;
  return (
    <g>
      <BackBody look={look} vest={extras?.vest} standing={standing} />
      <g className="head">
        <ellipse cx={cx + 8.6} cy={cy + 1} rx={1.6} ry={2.2} fill={shade(look.skin, -0.06)} />
        <ellipse cx={cx - 8.8} cy={cy + 1} rx={1.4} ry={2.1} fill={shade(look.skin, -0.1)} />
        <circle cx={cx} cy={cy} r={HEAD_R} fill={look.skin} />
        <BackHair style={look.hairStyle} color={look.hair} cx={cx} cy={cy} />
        {look.glasses && <path d={`M${cx + 8.2} ${cy - 0.6}L${cx + 5.5} ${cy - 1.2}`} stroke="#2b2b2b" strokeWidth={0.8} />}
        {extras?.cap && <Cap color={extras.cap} cx={cx} cy={cy} back />}
      </g>
    </g>
  );
}

/** Drawn with its origin at the seat surface (the hips, when standing); callers translate it to the projected seat point. */
export const Character = memo(function Character({ look, extras, facing, standing = false }: CharacterProps) {
  const body = isFrontFacing(facing) ? <Front look={look} extras={extras} standing={standing} /> : <Back look={look} extras={extras} standing={standing} />;
  return mirrored(facing) ? <g transform="scale(-1 1)">{body}</g> : body;
});
