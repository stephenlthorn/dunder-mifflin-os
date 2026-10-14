// One Ask Pam result: a portrait or glyph, the label and detail, a kind tag and, when active, "Show on the map".
import type { OfficeSnapshot } from '@shared/contract';
import { Portrait } from '../chrome/Portrait';
import { STATUS_META } from '../office/status';
import type { PamItem, PamKind } from './items';

const KIND_TAG: Record<PamKind, string> = {
  person: 'Person', bot: 'Chat', timeline: 'Timeline', room: 'Room', place: 'Place', action: 'Action', task: 'Task', job: 'Job', control: 'Control',
};
const GLYPH: Partial<Record<PamKind, string>> = { room: '▦', place: '⌖', action: '›' };

type Props = {
  id: string;
  item: PamItem;
  snapshot: OfficeSnapshot;
  live: boolean;
  selected: boolean;
  onHover: () => void;
  onRun: (alt: boolean) => void;
};

export function PamOption({ id, item, snapshot, live, selected, onHover, onRun }: Props) {
  const person = item.personId ? snapshot.people.find((p) => p.id === item.personId) : undefined;
  const status = item.kind === 'person' || item.kind === 'bot' ? item.status : undefined;
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      className={`pam-option kind-${item.kind}${selected ? ' is-active' : ''}`}
      onMouseMove={selected ? undefined : onHover}
      onClick={(e) => onRun(e.shiftKey)}
    >
      <span className="pam-icon" aria-hidden="true">
        {person ? <Portrait person={person} live={live} size="sm" decorative /> : <span className="pam-glyph">{GLYPH[item.kind] ?? '•'}</span>}
        {status && status !== 'no-bot' && <span className="pam-status" style={{ background: STATUS_META[status].color }} />}
      </span>
      <span className="pam-text">
        <span className="pam-label">{item.label}</span>
        <span className="pam-detail">{item.detail}</span>
      </span>
      {selected && item.alt && (
        <span className="pam-alt" aria-hidden="true" onClick={(e) => { e.stopPropagation(); onRun(true); }}>
          Show on the map
        </span>
      )}
      <span className="pam-kind">{KIND_TAG[item.kind]}</span>
    </div>
  );
}
