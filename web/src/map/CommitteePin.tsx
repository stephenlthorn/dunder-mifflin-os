// The Party Planning Committee's notice on the break-room bulletin board: a small calendar page that opens the
// committee's calendar. Keeps a constant on-screen size, like the room signs. A pointer shortcut only, so it stays out
// of the map's keyboard order (people and rooms): keyboards and screen readers use the top bar's labelled Calendar
// button, the Break Room window's link or Ask Pam.
import { memo } from 'react';
import { project } from '../iso/projection';

const BOARD = { x: 62.9, y: 34.4, z: 2.9 }; // above the break room's bulletin board (shared/office/furniture-back.ts: brk.board)

export const CommitteePin = memo(function CommitteePin({ scale, onOpen }: { scale: number; onOpen: () => void }) {
  const p = project(BOARD);
  const k = Math.min(1.4, Math.max(0.3, 1 / scale));
  return (
    <g className="ppc-pin" transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${k.toFixed(3)})`}>
      <g aria-hidden="true" data-ppc-pin="" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
        <title>Party Planning Committee calendar</title>
        <path className="ppc-pin-tail" d="M-3.5 -2.5L0 3L3.5 -2.5Z" />
        <rect className="ppc-pin-page" x={-13} y={-27} width={26} height={25} rx={3.5} />
        <rect className="ppc-pin-top" x={-13} y={-27} width={26} height={8} rx={3.5} />
        <rect className="ppc-pin-top" x={-13} y={-22} width={26} height={3} />
        <text className="ppc-pin-text" x={0} y={-7} textAnchor="middle" fontSize={9.5} fontWeight={800}>PPC</text>
      </g>
    </g>
  );
});
