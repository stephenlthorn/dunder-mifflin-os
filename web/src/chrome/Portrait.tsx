// A person's photo from the server (/api/portraits/:id: local files only, never in the repo), with the drawn mini
// character as the fallback: in demo mode, until the photo has loaded, and on 404 or any error, so a broken-image
// icon never shows. One component for the person window header, room member lists and the map tooltip.
import { useState } from 'react';
import type { Person } from '@shared/contract';
import { STAFF_BY_ID } from '@shared/office';
import { Character } from '../chars/Character';
import { portraitUrl } from '../data/api';

export type PhotoState = 'loading' | 'loaded' | 'failed';
export type PortraitSize = 'lg' | 'sm' | 'tip' | 'list';
export type PortraitView = { mode: 'drawn' | 'loading' | 'photo'; requestPhoto: boolean };

export function portraitView(live: boolean, state: PhotoState): PortraitView {
  if (!live || state === 'failed') return { mode: 'drawn', requestPhoto: false };
  return { mode: state === 'loaded' ? 'photo' : 'loading', requestPhoto: true };
}

// The whole seated figure in the big frame; head and shoulders in the small round ones.
const VIEW_BOX: Record<PortraitSize, string> = { lg: '-18 -50 38 46', sm: '-12 -34.5 26 26', tip: '-12 -34.5 26 26', list: '-12 -34.5 26 26' };

function Drawn({ person, size }: { person: Person; size: PortraitSize }) {
  return (
    <svg className="portrait-drawn" viewBox={VIEW_BOX[size]} aria-hidden="true" focusable="false">
      <g filter={person.bot ? undefined : 'url(#dm-sepia)'}>
        <Character look={person.look} extras={STAFF_BY_ID.get(person.id)?.extras} facing="s" />
      </g>
    </svg>
  );
}

type Props = { person: Person; live: boolean; size?: PortraitSize; decorative?: boolean };

export function Portrait({ person, live, size = 'lg', decorative = false }: Props) {
  const url = portraitUrl(person.id);
  const [photo, setPhoto] = useState<{ url: string; state: PhotoState }>({ url, state: 'loading' });
  const view = portraitView(live, photo.url === url ? photo.state : 'loading');
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': `${person.name} portrait` };
  return (
    <span className={`portrait portrait-${size}`} data-portrait={person.id} data-state={view.mode} {...a11y}>
      {view.mode !== 'photo' && <Drawn person={person} size={size} />}
      {view.requestPhoto && (
        <img
          src={url}
          alt=""
          draggable={false}
          onLoad={() => setPhoto({ url, state: 'loaded' })}
          onError={() => setPhoto({ url, state: 'failed' })}
        />
      )}
    </span>
  );
}
