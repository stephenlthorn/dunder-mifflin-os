// A sign on the accounting corner, by Angela's desk: "ACCOUNTING · ANGELA'S LEDGER". Clicking it (or Enter / Space)
// opens the ledger window. Drawn like the room signs, at a constant on-screen size, and in the map's keyboard order.
import type { KeyboardEvent } from 'react';
import { project } from '../iso/projection';
import { CHIP_FONT_FAMILY, textWidth } from './textWidth';
import { LEDGER_SIGN_ID, LEDGER_SPOT } from './mapTargets';

const TITLE = 'ACCOUNTING';
const SUB = 'ANGELA’S LEDGER';

export function LedgerSign({ scale, onOpen }: { scale: number; onOpen: () => void }) {
  const p = project(LEDGER_SPOT);
  const k = Math.min(1.4, Math.max(0.3, 1 / scale));
  const w = Math.max(textWidth(TITLE, 8.5, 700) * 1.12 + 16, textWidth(SUB, 8, 700) * 1.1 + 14);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <g transform={`translate(${p.x} ${p.y}) scale(${k})`} className="sign is-room ledger-sign">
      <g role="button" tabIndex={0} aria-label="Angela’s ledger — tokens and estimated cost per bot" data-area-sign={LEDGER_SIGN_ID} data-ledger-sign=""
        onClick={(e) => { e.stopPropagation(); onOpen(); }} onKeyDown={onKey}>
        <title>Angela’s ledger — tokens and estimated cost per bot</title>
        <rect className="sign-plate" x={-w / 2} y={-11} width={w} height={27} rx={3} />
        <text x={0} y={-0.6} textAnchor="middle" fontSize={8.5} fontWeight={700} letterSpacing={0.9} fontFamily={CHIP_FONT_FAMILY} fill="#4b4237">{TITLE}</text>
        <text x={0} y={11.4} textAnchor="middle" fontSize={8} fontWeight={700} letterSpacing={0.8} fontFamily={CHIP_FONT_FAMILY} fill="#2f7d4a">{SUB}</text>
      </g>
    </g>
  );
}
