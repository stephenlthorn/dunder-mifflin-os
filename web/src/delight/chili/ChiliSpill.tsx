// Kevin's chili spill: a bot in error has spilled a pot of chili at its desk. A red-brown puddle on the floor and the
// tipped pot, drawn in the seat's own frame (origin on the floor under the chair, perspective-scaled by the caller).
// The spill plays once when the error starts (a crashed run doesn't loop) and then just lies there; with reduced
// motion it is simply there. The real error text stays on the bot's status chip. Decorative: aria-hidden, no clicks.
import { memo } from 'react';

const CHILI = '#9c2f1c';
const CHILI_DARK = '#6e1f12';
const BEAN = '#4a1a10';

export const ChiliSpill = memo(function ChiliSpill() {
  return (
    <g className="chili-spill" aria-hidden="true" pointerEvents="none" data-chili="">
      <g className="chili-puddle">
        <path d="M2 4C8 -1 20 -1 27 3C33 6 34 12 27 14C21 16 16 13 10 15C3 17 -4 13 -3 9C-2 6 0 5 2 4Z" fill={CHILI} opacity={0.9} />
        <path d="M5 6C10 3 18 3 24 5C27 7 26 10 22 11C17 12 13 10 8 11C4 12 1 10 2 8Z" fill="#b8432a" opacity={0.85} />
        <ellipse cx={30} cy={15} rx={2.2} ry={1.2} fill={CHILI} />
        <ellipse cx={-6} cy={12} rx={1.6} ry={0.9} fill={CHILI} />
        <circle cx={12} cy={8} r={0.9} fill={BEAN} />
        <circle cx={18} cy={9} r={0.8} fill={BEAN} />
        <circle cx={21} cy={6} r={0.7} fill={BEAN} />
        <path d="M9 5.5C12 4.6 15 4.8 17 5.4" stroke="#e8875f" strokeWidth={0.7} fill="none" opacity={0.7} strokeLinecap="round" />
      </g>
      <g className="chili-pot" transform="translate(28 7)">
        <g className="chili-pot-tip">
          <ellipse cx={0} cy={2} rx={6.2} ry={3.6} fill="#2b2f36" />
          <path d="M-6 0L-5.4 -6Q0 -8.6 5.4 -6L6 0Q0 3.4 -6 0Z" fill="#8f949b" />
          <ellipse cx={0} cy={-6} rx={5.4} ry={2.4} fill="#5d636b" />
          <ellipse cx={0} cy={-6} rx={4.2} ry={1.6} fill={CHILI_DARK} />
          <path d="M-6.4 -3.6h-2M6.4 -3.6h2" stroke="#2b2f36" strokeWidth={1.4} strokeLinecap="round" />
        </g>
      </g>
    </g>
  );
});
