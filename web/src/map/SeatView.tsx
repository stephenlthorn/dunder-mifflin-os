// A seat: status ring on the floor, the chair, and whoever sits in it (drawn between the chair's back and front parts).
import { memo, useMemo } from 'react';
import type { Person, Presence } from '@shared/contract';
import type { Seat } from '@shared/office';
import { ELLIPSE_RY, UNIT_PX, Z_PX, project, scaleAt } from '../iso/projection';
import { STATUS_META } from '../office/status';
import { PersonFigure } from './PersonFigure';
import { seatParts } from './parts/chairParts';
import { sortParts } from './parts/furnitureParts';
import { PartView } from './parts/PartView';
import { useDelight } from '../delight/DelightContext';
import { ChiliSpill } from '../delight/chili/ChiliSpill';

export type Occupant = { person: Person; presence: Presence; label: string; away: boolean; walking: boolean; dimmed?: boolean; asking?: boolean };
type Props = { seat: Seat; occupant?: Occupant; onOpen: (id: string) => void };

const RING_R = 0.85;

export const SeatView = memo(function SeatView({ seat, occupant, onOpen }: Props) {
  const parts = useMemo(() => {
    const p = seatParts(seat);
    return { behind: sortParts(p.behind), front: sortParts(p.front) };
  }, [seat]);
  const at = project({ x: seat.x, y: seat.y });
  const k = Number(scaleAt(seat).toFixed(3)); // the figure and ring follow the perspective
  const lift = -(seat.chair === 'forklift' ? 1.15 : seat.chair === 'none' ? 1.05 : 0.92) * Z_PX;
  const status = occupant?.presence.status;
  const { mode } = useDelight();
  const spill = mode.jokes && status === 'error'; // Kevin's chili: the bot's error, at its desk
  return (
    <g className={occupant?.dimmed ? 'seat is-dimmed' : 'seat'} data-seat={seat.id}>
      {occupant && status && (
        <ellipse
          className={`status-ring ring-${status}`}
          cx={at.x}
          cy={at.y}
          rx={RING_R * UNIT_PX * k}
          ry={RING_R * ELLIPSE_RY * k}
          fill={STATUS_META[status].color}
          fillOpacity={status === 'no-bot' ? 0.08 : 0.2}
          stroke={STATUS_META[status].color}
          strokeWidth={status === 'no-bot' ? 1 : 2.2}
          strokeOpacity={status === 'no-bot' ? 0.45 : 0.95}
        />
      )}
      {spill && <g transform={`translate(${at.x} ${at.y}) scale(${k})`}><ChiliSpill /></g>}
      {parts.behind.map((p) => <PartView key={p.id} part={p} />)}
      {occupant && (
        <g transform={`translate(${at.x} ${at.y}) scale(${k})`} key={`${occupant.person.id}@${seat.id}`}>
          <PersonFigure
            person={occupant.person}
            presence={occupant.presence}
            facing={seat.facing}
            label={occupant.label}
            lift={lift}
            walking={occupant.walking}
            asking={occupant.asking}
            standing={seat.chair === 'none'}
            onOpen={onOpen}
          />
        </g>
      )}
      {parts.front.map((p) => <PartView key={p.id} part={p} />)}
    </g>
  );
});
