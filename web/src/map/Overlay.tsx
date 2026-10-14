// Things that must stay readable above the drawing: status chips over heads and room signs (room buttons).
// Both keep a constant on-screen size; chips are nudged upward so they never cover each other or a sign.
import { type KeyboardEvent, memo, useMemo } from 'react';
import type { Area } from '@shared/office';
import { project } from '../iso/projection';
import { STATUS_META, type AnyStatus } from '../office/status';
import { layoutLabels } from './chipLayout';
import { CHIP_FONT_FAMILY, textWidth } from './textWidth';
import { ReceptionPhone } from './ReceptionPhone';

/** A status chip anchored above a head; `figure` is the person's on-map body box (chips of others avoid it). */
export type ChipInfo = {
  personId: string; x: number; y: number; name: string; text: string; status: AnyStatus;
  figure: { x: number; y: number; w: number; h: number };
};
export type SignInfo = { area: Area; rooms: { id: string; name: string }[]; label: string };

const CHIP_H = 16;
const SEP = ' · ';
const COMPACT_BELOW = 1.3;
const COMPACT_CHARS = 20;
const PHONE_SIZE = 1.8; // the ringing phone reads at about the height of a chip

type ChipView = ChipInfo & { shown: string; size: number; w: number };
type SignView = SignInfo & { x: number; y: number; w: number; title: string; roomText: string };

function chipView(c: ChipInfo, compact: boolean): ChipView {
  const muted = c.status === 'no-bot';
  const size = muted ? 8.5 : 9.5;
  const clipped = compact && c.text.length > COMPACT_CHARS ? `${c.text.slice(0, COMPACT_CHARS - 1).trimEnd()}…` : c.text;
  const shown = compact && muted ? '' : clipped;
  const w = 19 + textWidth(c.name, size, 700) + (shown ? textWidth(SEP + shown, size, 400) : -3);
  return { ...c, shown, size, w };
}

function signView(s: SignInfo): SignView {
  const p = project(s.area.sign);
  const title = s.area.name.toUpperCase();
  const roomText = s.rooms.map((r) => r.name.toUpperCase()).join('  ·  ');
  const w = Math.max(textWidth(title, 8.5, 700) * 1.12 + 16, s.rooms.length ? textWidth(roomText, 8, 700) * 1.1 + 14 : 0);
  return { ...s, x: p.x, y: p.y, w, title, roomText };
}

const Chip = memo(function Chip({ c, k, at, onOpen }: { c: ChipView; k: number; at: { dx: number; dy: number }; onOpen: (id: string) => void }) {
  const muted = c.status === 'no-bot';
  const color = STATUS_META[c.status].color;
  const moved = Math.abs(at.dx) > 1 || at.dy < -3;
  const x = c.x + at.dx;
  const y = c.y + at.dy;
  return (
    <g className={`chip chip-${c.status}`} onClick={(e) => { e.stopPropagation(); onOpen(c.personId); }}>
      {moved && <path d={`M${c.x} ${c.y}L${x} ${y}`} stroke={muted ? '#cdbb98' : color} strokeWidth={1.1 * k} strokeDasharray={`${2 * k} ${1.5 * k}`} />}
      <g transform={`translate(${x} ${y}) scale(${k})`}>
        {!moved && <path d="M-4 -0.5L0 4L4 -0.5Z" fill={muted ? '#f6efe3' : '#ffffff'} />}
        <rect x={-c.w / 2} y={-CHIP_H} width={c.w} height={CHIP_H} rx={CHIP_H / 2} fill={muted ? '#f6efe3' : '#ffffff'} stroke={muted ? '#d5c4a3' : color} strokeWidth={1.1} />
        <circle cx={-c.w / 2 + 8.5} cy={-CHIP_H / 2} r={3.3} fill={color} />
        <text x={-c.w / 2 + 15} y={-CHIP_H / 2 + c.size * 0.36} fontSize={c.size} fontFamily={CHIP_FONT_FAMILY} fill={muted ? '#7a6a52' : '#2d2a26'}>
          <tspan fontWeight={700}>{c.name}</tspan>
          {c.shown && <tspan>{SEP + c.shown}</tspan>}
        </text>
      </g>
    </g>
  );
});

function Sign({ s, k, onOpenArea }: { s: SignView; k: number; onOpenArea: (areaId: string) => void }) {
  const clickable = s.rooms.length > 0;
  const onKey = (e: KeyboardEvent) => {
    if (clickable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onOpenArea(s.area.id);
    }
  };
  return (
    <g transform={`translate(${s.x} ${s.y}) scale(${k})`} className={clickable ? 'sign is-room' : 'sign'}>
      <g
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        aria-label={clickable ? s.label : undefined}
        data-area-sign={s.area.id}
        onClick={clickable ? (e) => { e.stopPropagation(); onOpenArea(s.area.id); } : undefined}
        onKeyDown={onKey}
      >
        {clickable && <title>{s.label}</title>}
        <rect className="sign-plate" x={-s.w / 2} y={-11} width={s.w} height={clickable ? 27 : 15} rx={3} />
        <text x={0} y={-0.6} textAnchor="middle" fontSize={8.5} fontWeight={700} letterSpacing={0.9} fontFamily={CHIP_FONT_FAMILY} fill="#4b4237">{s.title}</text>
        {clickable && <text x={0} y={11.4} textAnchor="middle" fontSize={8} fontWeight={700} letterSpacing={0.8} fontFamily={CHIP_FONT_FAMILY} fill="#1f5fae">{s.roomText}</text>}
      </g>
    </g>
  );
}

type Props = {
  chips: readonly ChipInfo[]; signs: readonly SignInfo[]; scale: number; onOpenPerson: (id: string) => void; onOpenArea: (areaId: string) => void;
  phone?: { x: number; y: number; count: number }; // Pam's reception phone; rings while count > 0
};

export const Overlay = memo(function Overlay({ chips, signs, scale, onOpenPerson, onOpenArea, phone }: Props) {
  const k = Math.min(1.4, Math.max(0.3, 1 / scale));
  const compact = scale < COMPACT_BELOW;
  const signViews = useMemo(() => signs.map(signView), [signs]);
  const chipViews = useMemo(() => chips.map((c) => chipView(c, compact)), [chips, compact]);
  const offsets = useMemo(() => layoutLabels(
    chipViews.map((c) => ({
      id: c.personId, x: c.x, y: c.y + 4 * k, w: c.w * k, h: (CHIP_H + 4) * k,
      priority: c.status === 'no-bot' ? 1 : 0, optional: compact && c.status === 'no-bot',
    })),
    [
      ...signViews.map((s) => ({ id: s.area.id, x: s.x, y: s.y + (s.rooms.length ? 16 : 4) * k, w: s.w * k, h: (s.rooms.length ? 27 : 15) * k })),
      ...chipViews.map((c) => ({ id: `fig-${c.personId}`, owner: c.personId, ...c.figure })),
    ],
  ), [chipViews, signViews, k, compact]);
  return (
    <g className="overlay">
      {phone && <ReceptionPhone x={phone.x} y={phone.y} k={k * PHONE_SIZE} count={phone.count} />}
      <g className="signs">{signViews.map((s) => <Sign key={s.area.id} s={s} k={k} onOpenArea={onOpenArea} />)}</g>
      <g className="chips" aria-hidden="true">
        {chipViews
          .flatMap((c) => {
            const at = offsets[c.personId];
            return at ? [{ c, at }] : [];
          })
          .sort((a, b) => a.c.y + a.at.dy - (b.c.y + b.at.dy))
          .map(({ c, at }) => <Chip key={c.personId} c={c} k={k} at={at} onOpen={onOpenPerson} />)}
      </g>
    </g>
  );
});
