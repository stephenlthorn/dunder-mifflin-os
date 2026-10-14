// A Dundie on a winner's desk for the week: a small gold statuette on a wood base, in screen units at map scale 1
// (the caller scales it with the perspective). "×2" when one bot won more than one. Decorative: no clicks.
export function Trophy({ count }: { count: number }) {
  return (
    <g className="dundie-trophy" aria-hidden="true" pointerEvents="none" data-trophy="">
      <ellipse cx={0} cy={0.6} rx={4.6} ry={1.6} fill="rgba(40,30,20,.25)" />
      <path d="M-3.6 0L-3.2 -3.4L3.2 -3.4L3.6 0Z" fill="#5a3b22" />
      <path d="M-3.2 -3.4L-2.9 -4.4L2.9 -4.4L3.2 -3.4Z" fill="#7a5532" />
      <path d="M-1.2 -4.4L-1.4 -10L1.4 -10L1.2 -4.4Z" fill="#d4a017" />
      <circle cx={0} cy={-11.8} r={2} fill="#e8b923" />
      <path d="M-1.3 -9.4L-4.2 -14.6M1.3 -9.4L4.2 -14.6" stroke="#d4a017" strokeWidth={1.3} strokeLinecap="round" />
      <circle cx={-4.4} cy={-15} r={1} fill="#f2cc4a" />
      <circle cx={4.4} cy={-15} r={1} fill="#f2cc4a" />
      <path d="M-0.6 -12.6L-0.2 -13.3" stroke="#fff6cc" strokeWidth={0.6} strokeLinecap="round" />
      {count > 1 && (
        <g>
          <rect x={4.2} y={-9} width={8.6} height={6} rx={3} fill="#ffffff" stroke="#d4a017" strokeWidth={0.6} />
          <text x={8.5} y={-4.6} textAnchor="middle" fontSize={4.6} fontWeight={800} fill="#8a6a00" fontFamily="system-ui, sans-serif">×{count}</text>
        </g>
      )}
    </g>
  );
}
