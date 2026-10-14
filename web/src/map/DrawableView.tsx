import { memo, useMemo } from 'react';
import type { Furniture } from '@shared/office';
import type { Drawable } from '../office/scene';
import { furnitureParts } from './parts/furnitureParts';
import { PartView } from './parts/PartView';
import { type Occupant, SeatView } from './SeatView';
import { WallView } from './WallView';

const FurnitureView = memo(function FurnitureView({ item }: { item: Furniture }) {
  const parts = useMemo(() => furnitureParts(item), [item]);
  return (
    <g className={`furniture kind-${item.kind}`} data-furniture={item.id}>
      {parts.map((p) => <PartView key={p.id} part={p} />)}
    </g>
  );
});

type Props = { drawable: Drawable; occupant?: Occupant; onOpen: (id: string) => void };

export function DrawableView({ drawable, occupant, onOpen }: Props) {
  switch (drawable.type) {
    case 'wall':
      return <WallView piece={drawable.piece} />;
    case 'furniture':
      return <FurnitureView item={drawable.item} />;
    default:
      return <SeatView seat={drawable.seat} occupant={occupant} onOpen={onOpen} />;
  }
}
