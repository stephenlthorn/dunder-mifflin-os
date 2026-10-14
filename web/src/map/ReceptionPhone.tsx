// Pam's reception phone, drawn over the handset on her desk: it rings (a gentle shake and sound waves, plus how many
// need you) while anyone needs you, and sits quietly otherwise. Constant on-screen size (k). Decorative: the top
// bar's "N need you" button is the accessible way in. The chime is played elsewhere (usePhoneRing), never here.
type Props = { x: number; y: number; k: number; count: number };

const ASK = '#e8590c';

export function ReceptionPhone({ x, y, k, count }: Props) {
  const ringing = count > 0;
  return (
    <g className={`reception-phone${ringing ? ' is-ringing' : ''}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(3)})`} aria-hidden="true" pointerEvents="none">
      {ringing && (
        <g className="ring-arcs" stroke={ASK} strokeWidth={1.4} fill="none" strokeLinecap="round">
          <path className="ring-arc ring-arc-1" d="M-9 -15A10 10 0 0 0 -9 -1" />
          <path className="ring-arc ring-arc-2" d="M-13 -18A14 14 0 0 0 -13 2" />
          <path className="ring-arc ring-arc-1" d="M9 -15A10 10 0 0 1 9 -1" />
          <path className="ring-arc ring-arc-2" d="M13 -18A14 14 0 0 1 13 2" />
        </g>
      )}
      <g className="handset">
        <path d="M-6.5 -11.5Q0 -14.5 6.5 -11.5L7 -8.5L3.6 -7.6L3 -9.6Q0 -10.6 -3 -9.6L-3.6 -7.6L-7 -8.5Z" fill={ringing ? '#2b2f36' : '#4a4f57'} />
        <path d="M-5 -6.5L5 -6.5L6.5 -2L-6.5 -2Z" fill={ringing ? '#2b2f36' : '#4a4f57'} />
      </g>
      {ringing && (
        <g className="phone-badge">
          <circle cx={9} cy={-15} r={5.6} fill={ASK} stroke="#ffffff" strokeWidth={1.2} />
          <text x={9} y={-12.3} textAnchor="middle" fontSize={7.5} fontWeight={800} fill="#ffffff" fontFamily="system-ui, sans-serif">{count > 9 ? '9+' : count}</text>
        </g>
      )}
    </g>
  );
}
