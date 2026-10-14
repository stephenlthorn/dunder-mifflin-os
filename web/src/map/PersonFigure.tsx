// A clickable, focusable mini character in its seat. Status drives the filter (sepia / dimmed) and a gentle animation.
import { type KeyboardEvent, memo } from 'react';
import type { Person, Presence } from '@shared/contract';
import type { Facing } from '@shared/office';
import { STAFF_BY_ID } from '@shared/office';
import { Character } from '../chars/Character';
import { RaisedHand } from './RaisedHand';

type Props = {
  person: Person; presence: Presence; facing: Facing; label: string; lift: number; walking: boolean; onOpen: (id: string) => void;
  asking?: boolean; // needs you: a raised hand and a "?" bubble
  standing?: boolean; // up and about (an idle bot at the coffee maker)
};

const FILTER: Partial<Record<Presence['status'], string>> = { 'no-bot': 'url(#dm-sepia)', offline: 'url(#dm-grey)' };

export const PersonFigure = memo(function PersonFigure({ person, presence, facing, label, lift, walking, onOpen, asking = false, standing = false }: Props) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(person.id);
    }
  };
  const status = presence.status;
  return (
    <g transform={`translate(0 ${lift})`}>
      <g
        role="button"
        tabIndex={0}
        aria-label={label}
        data-person={person.id}
        data-status={status}
        data-asking={asking ? 'true' : undefined}
        className={`person status-${status}${walking ? ' walk-in' : ''}${asking ? ' is-asking' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(person.id);
        }}
        onKeyDown={onKey}
      >
        <ellipse className="focus-ring" cx={1} cy={-16} rx={16} ry={24} />
        <rect x={-13} y={-38} width={27} height={42} fill="transparent" />
        <g filter={FILTER[status]} opacity={status === 'offline' ? 0.5 : 1}>
          <Character look={person.look} extras={STAFF_BY_ID.get(person.id)?.extras} facing={facing} standing={standing} />
        </g>
        {asking && <RaisedHand look={person.look} />}
      </g>
    </g>
  );
});
