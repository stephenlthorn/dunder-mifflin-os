// Someone needs you: a raised hand (waving gently) and a "?" speech bubble beside the head, in the seated figure's
// own coordinates (origin at the seat surface; the head is centred at (1, -22), radius 9). Kept below the status chip.
import type { Look } from '@shared/contract';

const ASK = '#e8590c'; // the needs-you orange (STATUS_META['needs-input'])

export function RaisedHand({ look }: { look: Look }) {
  const sleeve = look.robot ? '#9aa3ad' : (look.jacket ?? look.cardigan ?? look.shirt);
  const skin = look.robot ? '#c9d1d9' : look.skin;
  return (
    <g className="raised-hand" pointerEvents="none">
      <g className="raised-arm">
        <path d="M7.4 -12.5L11.4 -21.5L12.6 -30" stroke={sleeve} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx={12.8} cy={-31.6} r={2.3} fill={skin} />
        <path d="M11.6 -33.4L11.4 -35.2M12.8 -33.8L12.8 -35.7M14 -33.4L14.3 -35.1" stroke={skin} strokeWidth={1.1} strokeLinecap="round" />
      </g>
      <g className="ask-bubble">
        <path d="M-10.6 -24.2L-7.6 -22.6L-10.2 -21.2Z" fill="#ffffff" stroke={ASK} strokeWidth={0.9} strokeLinejoin="round" />
        <circle cx={-15.4} cy={-25.8} r={6.2} fill="#ffffff" stroke={ASK} strokeWidth={1.2} />
        <text x={-15.4} y={-22.4} textAnchor="middle" fontSize={9.5} fontWeight={800} fill={ASK} fontFamily="system-ui, sans-serif">?</text>
      </g>
    </g>
  );
}
