// The map's hover/focus tooltip for a person: a small round portrait, their name, bot and status, and what they're
// doing. Anchored in the map wrapper's pixels to the on-screen box of the hovered or focused figure.
import { type FocusEvent, type PointerEvent, type RefObject, useCallback, useMemo, useState } from 'react';
import type { OfficeSnapshot } from '@shared/contract';
import { Portrait } from '../chrome/Portrait';
import { presenceFor, statusWord } from '../office/status';

export type TipAnchor = { personId: string; x: number; y: number; below: boolean };
type Box = { left: number; top: number; width: number; bottom: number };

const FLIP_BELOW_PX = 72; // closer than this to the top edge: show the tip under the figure

export function tipAnchor(personId: string, figure: Box, wrap: { left: number; top: number }): TipAnchor {
  const top = figure.top - wrap.top;
  const below = top < FLIP_BELOW_PX;
  return { personId, x: figure.left + figure.width / 2 - wrap.left, y: below ? figure.bottom - wrap.top : top, below };
}

/** Pointer and focus handlers for the map wrapper (events bubble up from the figures' `[data-person]` groups). */
export function usePersonTip(wrap: RefObject<HTMLDivElement | null>) {
  const [tip, setTip] = useState<TipAnchor | null>(null);
  const showFor = useCallback((target: EventTarget | null) => {
    const figure = target instanceof Element ? target.closest('[data-person]') : null;
    const id = figure?.getAttribute('data-person');
    const box = wrap.current?.getBoundingClientRect();
    setTip(figure && id && box ? tipAnchor(id, figure.getBoundingClientRect(), box) : null);
  }, [wrap]);
  const hide = useCallback(() => setTip(null), []);
  const handlers = useMemo(() => {
    return {
      onPointerOver: (e: PointerEvent) => { if (e.buttons === 0) showFor(e.target); },
      onPointerLeave: hide,
      onPointerDown: hide,
      onWheel: hide,
      onFocus: (e: FocusEvent) => showFor(e.target),
      onBlur: hide,
    };
  }, [showFor, hide]);
  return { tip, handlers, showFor, hide };
}

export function PersonTip({ tip, snapshot, live }: { tip: TipAnchor; snapshot: OfficeSnapshot; live: boolean }) {
  const person = snapshot.people.find((p) => p.id === tip.personId);
  if (!person) return null;
  const presence = presenceFor(person, snapshot.presence);
  return (
    <div className={`person-tip${tip.below ? ' is-below' : ''}`} role="tooltip" style={{ left: tip.x, top: tip.y }}>
      <Portrait key={person.id} person={person} live={live} size="tip" decorative />
      <span className="person-tip-text">
        <strong>{person.name}</strong>
        <span>{person.bot ? `${person.bot.profile} · ${statusWord(presence.status)}` : 'No bot yet'}</span>
        {presence.activity && <span className="person-tip-activity">{presence.activity}</span>}
      </span>
    </div>
  );
}
