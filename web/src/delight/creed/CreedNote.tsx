// "Creed knows something": a thought bubble over Creed's head while there is activity no desk can hold. In the seated
// figure's frame (head centred at (1, -22), radius 9), like the raised hand. Decorative; Creed's label says it.
export const CREED_DESK = 'creed';

export function CreedNote({ count }: { count: number }) {
  return (
    <g className="creed-note" aria-hidden="true" pointerEvents="none" data-creed-note="">
      <circle cx={-10.6} cy={-19.6} r={1.2} fill="#fffdf6" stroke="#8a7f70" strokeWidth={0.6} />
      <circle cx={-14} cy={-21.4} r={1.8} fill="#fffdf6" stroke="#8a7f70" strokeWidth={0.6} />
      <path d="M-38 -24Q-39 -31 -32 -31Q-29 -36 -23 -33Q-18 -36 -15 -31Q-10 -30 -11 -25Q-9 -19 -16 -18Q-20 -15 -26 -17Q-31 -14 -34 -18Q-40 -18 -38 -24Z"
        fill="#fffdf6" stroke="#8a7f70" strokeWidth={0.8} />
      <text x={-25} y={-21} textAnchor="middle" fontSize={9} fontWeight={800} fill="#5b3f8c" fontFamily="system-ui, sans-serif">?!</text>
      {count > 1 && (
        <g>
          <circle cx={-38} cy={-31} r={4.6} fill="#5b3f8c" stroke="#ffffff" strokeWidth={0.9} />
          <text x={-38} y={-28.6} textAnchor="middle" fontSize={6.4} fontWeight={800} fill="#ffffff" fontFamily="system-ui, sans-serif">{count > 9 ? '9+' : count}</text>
        </g>
      )}
    </g>
  );
}
