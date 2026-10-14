// Face for the front 3/4 view: eyes, brows, nose, mouth, blush, glasses, mustache, stubble.
import type { Look } from '@shared/contract';
import { shade } from '../iso/color';
import { INK } from './geometry';

export function Face({ look, cx, cy }: { look: Look; cx: number; cy: number }) {
  const ex1 = cx - 1;
  const ex2 = cx + 5;
  const ey = cy + 0.6;
  const brow = shade(look.hair, -0.15);
  return (
    <g>
      {look.beard && <path d={`M${cx - 8.6} ${cy + 0.5}C${cx - 7.6} ${cy + 8.6} ${cx + 6.6} ${cy + 10.2} ${cx + 8.2} ${cy + 2}C${cx + 6.4} ${cy + 7.6} ${cx - 0.6} ${cy + 8.2} ${cx - 3} ${cy + 6.4}C${cx - 5.6} ${cy + 5.2} ${cx - 7.2} ${cy + 3.4} ${cx - 8.6} ${cy + 0.5}Z`} fill={look.hair} opacity={0.32} />}
      <ellipse cx={ex1 - 0.8} cy={cy + 3.6} rx={1.5} ry={0.9} fill="#f08a8a" opacity={0.32} />
      <ellipse cx={ex2 + 1.4} cy={cy + 3.6} rx={1.5} ry={0.9} fill="#f08a8a" opacity={0.32} />
      <ellipse cx={ex1} cy={ey} rx={1.05} ry={1.4} fill={INK} />
      <ellipse cx={ex2} cy={ey} rx={1.05} ry={1.4} fill={INK} />
      <circle cx={ex1 + 0.35} cy={ey - 0.5} r={0.35} fill="#fff" />
      <circle cx={ex2 + 0.35} cy={ey - 0.5} r={0.35} fill="#fff" />
      <path d={`M${ex1 - 1.4} ${cy - 2.4}L${ex1 + 1.2} ${cy - 2.8}M${ex2 - 1.1} ${cy - 2.8}L${ex2 + 1.4} ${cy - 2.5}`} stroke={brow} strokeWidth={0.8} strokeLinecap="round" />
      <path d={`M${cx + 2.6} ${cy + 2.4}q0.9 0.7 0.1 1.2`} stroke={shade(look.skin, -0.3)} strokeWidth={0.6} fill="none" strokeLinecap="round" />
      {look.mustache
        ? <path d={`M${cx - 0.2} ${cy + 4.6}C${cx + 1} ${cy + 3.4} ${cx + 4.6} ${cy + 3.4} ${cx + 6} ${cy + 4.6}C${cx + 4.4} ${cy + 5.6} ${cx + 1.2} ${cy + 5.6} ${cx - 0.2} ${cy + 4.6}Z`} fill={shade(look.hair, -0.1)} />
        : null}
      <path d={`M${cx + 0.8} ${cy + 5.6}q2 1.6 4 0`} stroke="#8a4b3a" strokeWidth={0.75} fill="none" strokeLinecap="round" />
      {look.glasses && (
        <g stroke="#2b2b2b" strokeWidth={0.8} fill="#cfe8f5" fillOpacity={0.25}>
          <rect x={ex1 - 2.3} y={ey - 1.9} width={4.4} height={3.6} rx={1.1} />
          <rect x={ex2 - 2.1} y={ey - 1.9} width={4.4} height={3.6} rx={1.1} />
          <path d={`M${ex1 + 2.1} ${ey - 0.6}L${ex2 - 2.1} ${ey - 0.6}M${ex1 - 2.3} ${ey - 0.8}L${cx - 7.6} ${ey - 0.4}`} fill="none" />
        </g>
      )}
    </g>
  );
}
